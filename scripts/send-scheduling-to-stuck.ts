/**
 * Re-send the training_completed scheduling email/SMS to candidates who are
 * stuck on training_started with zero sections completed (the inline-video
 * landing-page bug).
 *
 * Sends ONLY the rule's steps (email/SMS) — does not call applyStageTrigger,
 * so the candidate stays on their current funnel stage. They'll advance only
 * if they actually click the scheduling link.
 *
 * Usage:
 *   # Preview (no emails sent):
 *   DATABASE_URL=... npx tsx scripts/send-scheduling-to-stuck.ts
 *   # Actually send:
 *   DATABASE_URL=... npx tsx scripts/send-scheduling-to-stuck.ts --live
 */
import { PrismaClient } from '@prisma/client'
import { dispatchRule } from '../src/lib/automation'

const prisma = new PrismaClient()
const LIVE = process.argv.includes('--live')

function header(s: string) { console.log(`\n=== ${s} ===`) }

async function main() {
  header(LIVE ? 'LIVE MODE — emails WILL be sent' : 'DRY RUN — no emails will be sent (pass --live to send)')

  // 1. Find stuck enrollments with zero progress and an attached session
  const enrollments = await prisma.trainingEnrollment.findMany({
    where: { status: 'in_progress', completedAt: null, sessionId: { not: null } },
    include: {
      training: { select: { id: true, title: true, workspaceId: true } },
      session: {
        select: {
          id: true, candidateName: true, candidateEmail: true,
          pipelineStatus: true, workspaceId: true, flowId: true,
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  })

  type Stuck = {
    sessionId: string
    candidate: string
    email: string
    workspaceId: string
    flowId: string
    trainingId: string
    trainingTitle: string
    pipelineStatus: string
  }
  const stuck: Stuck[] = []
  for (const e of enrollments) {
    const progress = (e.progress as { completedSections?: string[] } | null) || null
    const completed = progress?.completedSections?.length ?? 0
    if (completed > 0 || !e.session) continue
    stuck.push({
      sessionId: e.session.id,
      candidate: e.session.candidateName || e.userName || '—',
      email: e.session.candidateEmail || e.userEmail || '—',
      workspaceId: e.session.workspaceId,
      flowId: e.session.flowId,
      trainingId: e.training.id,
      trainingTitle: e.training.title,
      pipelineStatus: e.session.pipelineStatus || '—',
    })
  }

  header(`Stuck candidates: ${stuck.length}`)
  for (const s of stuck) console.log(`  ${s.candidate.padEnd(24)}  ${s.email.padEnd(34)}  ${s.trainingTitle}`)

  // 2. Group by (workspaceId, flowId) and resolve training_completed rules
  const groups = new Map<string, Stuck[]>()
  for (const s of stuck) {
    const key = `${s.workspaceId}::${s.flowId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }

  header('Resolving training_completed rules per workspace/flow')
  type Plan = { stuck: Stuck; ruleIds: string[]; ruleNames: string[] }
  const plans: Plan[] = []

  for (const [key, group] of groups) {
    const [workspaceId, flowId] = key.split('::')
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: 'training_completed',
        workspaceId,
        OR: [{ flowId }, { flowId: null }],
      },
      select: {
        id: true, name: true, flowId: true,
        steps: { select: { id: true, channel: true, delayMinutes: true, nextStepType: true, emailTemplateId: true } },
      },
    })
    console.log(`\n  workspace=${workspaceId.slice(0, 8)} flow=${flowId.slice(0, 8)} → ${rules.length} active rule(s)`)
    for (const r of rules) {
      const channels = r.steps.map(s => `${s.channel}${s.nextStepType ? `[${s.nextStepType}]` : ''}@+${s.delayMinutes}m`).join(', ')
      console.log(`    - ${r.name} (${r.id.slice(0, 8)})  steps: ${channels || '(no steps)'}`)
    }
    if (rules.length === 0) {
      console.log('    ⚠ no rules — these candidates would receive nothing. Skipping group.')
      continue
    }
    for (const s of group) {
      plans.push({ stuck: s, ruleIds: rules.map(r => r.id), ruleNames: rules.map(r => r.name) })
    }
  }

  header(`Dispatch plan: ${plans.length} session(s) × rule(s)`)
  for (const p of plans) {
    console.log(`  ${p.stuck.candidate.padEnd(24)} ${p.stuck.email.padEnd(34)} → rules: ${p.ruleNames.join(', ')}`)
  }

  if (!LIVE) {
    console.log('\nDry run complete. Re-run with --live to actually queue the emails.')
    await prisma.$disconnect()
    return
  }

  // 3. Live: dispatch each rule for each session
  header('Dispatching…')
  let ok = 0, fail = 0
  for (const p of plans) {
    for (const ruleId of p.ruleIds) {
      try {
        await dispatchRule(ruleId, p.stuck.sessionId)
        console.log(`  ✓ ${p.stuck.candidate} (${p.stuck.email}) ← rule ${ruleId.slice(0, 8)}`)
        ok++
      } catch (err) {
        console.error(`  ✗ ${p.stuck.candidate} ← rule ${ruleId.slice(0, 8)}:`, (err as Error).message)
        fail++
      }
    }
  }

  header('Done')
  console.log(`  Dispatched: ${ok}  Failed: ${fail}`)
  console.log('  Pipeline stages were NOT changed. Candidates remain on their current funnel stage.')
  console.log('  Watch their pipelineStatus over the next 24-48h to see who schedules vs stays put.')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect()
  process.exit(1)
})
