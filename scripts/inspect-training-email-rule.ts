/**
 * Inspect the "Training email after completing form" rule for Spotless
 * and find candidates in the Application stage who got step 0 but not
 * the follow-up step.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const WS = '739bcd71-69fd-4b30-a39e-242521b7ab20'
const STAGE_APPLICATION = 'in_progress' // Spotless's "Application " stage id

async function main() {
  const rules = await prisma.automationRule.findMany({
    where: {
      workspaceId: WS,
      name: { contains: 'Training email', mode: 'insensitive' },
    },
    include: { steps: { orderBy: { order: 'asc' } }, training: { select: { title: true } } },
  })
  console.log(`\nFound ${rules.length} matching rule(s)\n`)
  for (const r of rules) {
    console.log(`Rule: ${r.name}  (id=${r.id})`)
    console.log(`  isActive       : ${r.isActive}`)
    console.log(`  triggerType    : ${r.triggerType}`)
    console.log(`  flowId         : ${r.flowId ?? '(any)'}`)
    console.log(`  trainingId     : ${r.trainingId ?? '(any)'}`)
    console.log(`  triggerAutomationId: ${r.triggerAutomationId ?? '—'}`)
    console.log(`  stageId        : ${r.stageId ?? '—'}`)
    console.log(`  steps          : ${r.steps.length}`)
    for (const s of r.steps) {
      console.log(`    [${s.order}] channel=${s.channel} delayMin=${s.delayMinutes} timing=${s.timingMode ?? 'trigger'} nextStep=${s.nextStepType ?? '—'} smsBody=${s.smsBody ? s.smsBody.slice(0, 50) + '…' : '—'}`)
    }
  }

  // What statuses actually exist?
  const distinct = await prisma.session.groupBy({
    by: ['pipelineStatus'],
    where: { workspaceId: WS },
    _count: true,
  })
  console.log('\npipelineStatus distribution in workspace:')
  for (const d of distinct) console.log(`  ${(d.pipelineStatus ?? 'null').padEnd(28)} ${d._count}`)

  // Look up the parent rule (the one that fires this rule via automation_completed chain)
  const parentRule = rules[0]?.triggerAutomationId
    ? await prisma.automationRule.findUnique({
        where: { id: rules[0].triggerAutomationId },
        include: { steps: { orderBy: { order: 'asc' } } },
      })
    : null
  if (parentRule) {
    console.log(`\nParent rule (fires this one via automation_completed):`)
    console.log(`  name=${parentRule.name}  triggerType=${parentRule.triggerType}  isActive=${parentRule.isActive}  steps=${parentRule.steps.length}`)
  }

  // Application-stage candidates — try in_progress AND legacy fallbacks
  const APP_STATUSES = ['in_progress', 'completed_flow', 'invited_to_schedule', 'applied', 'passed', 'training_in_progress']
  const apps = await prisma.session.findMany({
    where: {
      workspaceId: WS,
      pipelineStatus: { in: APP_STATUSES },
    },
    select: {
      id: true,
      candidateName: true,
      candidateEmail: true,
      startedAt: true,
      flow: { select: { id: true, name: true } },
    },
    orderBy: { startedAt: 'desc' },
  })
  console.log(`\n\nApplication-stage candidates: ${apps.length}\n`)

  // What statuses exist for step 1 across ALL sessions for this rule?
  for (const r of rules) {
    if (!r.steps[1]) continue
    const allStep1 = await prisma.automationExecution.groupBy({
      by: ['status'],
      where: { automationRuleId: r.id, stepId: r.steps[1].id },
      _count: true,
    })
    console.log(`\nStep 1 (3-day follow-up) execution status distribution for "${r.name}":`)
    if (allStep1.length === 0) {
      console.log('  (no executions exist for step 1 — never queued)')
    } else {
      for (const s of allStep1) console.log(`  ${s.status.padEnd(20)} ${s._count}`)
    }
  }

  // For each, count executions per rule.id we found
  for (const r of rules) {
    console.log(`\n--- Coverage for rule "${r.name}" (${r.steps.length} steps) ---`)
    if (r.steps.length === 0) continue
    type Row = { sid: string; name: string; email: string; days: number; counts: number[] }
    const rows: Row[] = []
    for (const c of apps) {
      const execs = await prisma.automationExecution.findMany({
        where: { sessionId: c.id, automationRuleId: r.id },
        select: { stepId: true, status: true, createdAt: true },
      })
      const counts = r.steps.map((s) => execs.filter((e) => e.stepId === s.id && e.status === 'sent').length)
      // Also dump non-sent executions for step 1 to see what's going on
      if (r.steps[1]) {
        const step1Execs = execs.filter((e) => e.stepId === r.steps[1].id)
        if (step1Execs.length > 0 && step1Execs.every((e) => e.status !== 'sent')) {
          console.log(`    [step1 debug for ${c.candidateName}] ${step1Execs.map((e) => `${e.status}@${e.createdAt.toISOString()}`).join(', ')}`)
        }
      }
      const days = Math.floor((Date.now() - c.startedAt.getTime()) / 86400000)
      rows.push({ sid: c.id, name: c.candidateName ?? '—', email: c.candidateEmail ?? '—', days, counts })
    }
    // Show only ones that got step 0 but not step 1 (the follow-up)
    const missingFollowup = rows.filter((r2) => r2.counts[0] > 0 && r.steps[1] && r2.counts[1] === 0)
    console.log(`Got step 0 but missing step 1: ${missingFollowup.length}`)
    for (const r2 of missingFollowup) {
      console.log(`  ${r2.days}d ago  ${r2.name.padEnd(28)} ${r2.email.padEnd(36)}  step counts=[${r2.counts.join(',')}]  sid=${r2.sid}`)
    }
    const noStep0 = rows.filter((r2) => r2.counts[0] === 0)
    console.log(`Got NO executions at all (step 0 missing too): ${noStep0.length}`)
    for (const r2 of noStep0.slice(0, 10)) {
      console.log(`  ${r2.days}d ago  ${r2.name.padEnd(28)} ${r2.email.padEnd(36)}  sid=${r2.sid}`)
    }
  }

  await prisma.$disconnect()
}

main().catch(console.error)
