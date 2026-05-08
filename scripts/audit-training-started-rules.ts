/**
 * Surfaces every active training_started rule across all workspaces.
 * Until f106b67, fireTrainingStartedAutomations didn't call the
 * dispatcher — so any rule wired to this trigger was silently dormant.
 * On next deploy they will start firing. Sanity-check before that.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const rules = await prisma.automationRule.findMany({
    where: { triggerType: 'training_started' },
    include: {
      workspace: { select: { name: true } },
      flow: { select: { name: true } },
      training: { select: { title: true } },
      steps: {
        orderBy: { order: 'asc' },
        select: { order: true, channel: true, delayMinutes: true, nextStepType: true, timingMode: true },
      },
    },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  })

  console.log(`\nFound ${rules.length} training_started rule(s) total\n`)
  console.log('='.repeat(120))

  for (const r of rules) {
    const flag = r.isActive ? '[ACTIVE]' : '[paused]'
    console.log(`\n${flag} ${r.name}`)
    console.log(`  workspace : ${r.workspace?.name}`)
    console.log(`  flow      : ${r.flow?.name ?? '(any flow)'}`)
    console.log(`  training  : ${r.training?.title ?? '(any training — WILDCARD)'}`)
    console.log(`  channel   : ${r.channel}    actionType: ${r.actionType}`)
    console.log(`  steps     : ${r.steps.length}`)
    for (const s of r.steps) {
      console.log(`    ${s.order}. ${s.channel} delay=${s.delayMinutes}m timingMode=${s.timingMode ?? 'trigger'} nextStep=${s.nextStepType ?? '—'}`)
    }
    console.log(`  ruleId    : ${r.id}`)
  }

  const active = rules.filter(r => r.isActive)
  const wildcard = active.filter(r => !r.trainingId)
  console.log('\n' + '='.repeat(120))
  console.log(`Active total      : ${active.length}`)
  console.log(`Active + wildcard : ${wildcard.length}  ← these fire on every training_started in their workspace`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
