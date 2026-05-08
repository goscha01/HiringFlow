/**
 * Survey AutomationRule.trainingId in prod. The pre-fix code mirrored
 * firstStep.trainingId onto rule.trainingId, conflating the trigger-filter
 * concept with the action-target concept. After the dispatcher fix, the
 * value is read as a trigger filter — so any rules where the legacy mirror
 * wrote the wrong value are now mis-scoped.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const rules = await prisma.automationRule.findMany({
    where: { trainingId: { not: null } },
    include: {
      workspace: { select: { name: true } },
      training: { select: { title: true } },
      steps: { select: { trainingId: true, nextStepType: true }, orderBy: { order: 'asc' }, take: 1 },
    },
  })
  console.log(`\n${rules.length} rule(s) currently have rule.trainingId set\n`)
  console.log('='.repeat(120))
  for (const r of rules) {
    const firstStepTraining = r.steps[0]?.trainingId
    const matchesFirstStep = firstStepTraining === r.trainingId
    console.log(`\n[${r.isActive ? 'ACTIVE' : 'paused'}] ${r.name}  (${r.workspace.name})`)
    console.log(`  trigger        : ${r.triggerType}`)
    console.log(`  rule.trainingId: ${r.trainingId}  (${r.training?.title})`)
    console.log(`  step0.training : ${firstStepTraining ?? '—'}  step0.nextStep=${r.steps[0]?.nextStepType ?? '—'}`)
    console.log(`  came from step?: ${matchesFirstStep ? 'YES (legacy mirror — likely wrong as trigger filter)' : 'no — independent value'}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
