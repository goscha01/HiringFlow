/**
 * Clear AutomationRule.trainingId on rules whose triggerType is NOT
 * training_started/training_completed. Those values came from the old
 * "mirror firstStep.trainingId onto rule.trainingId" code path, which
 * conflated the trigger filter with the action target. After f106b67 +
 * the editor refactor, rule.trainingId is only meaningful as a trigger
 * filter for training-* triggers — these stale values are dead weight.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
  const stale = await prisma.automationRule.findMany({
    where: {
      trainingId: { not: null },
      triggerType: { notIn: ['training_started', 'training_completed'] },
    },
    select: { id: true, name: true, triggerType: true, trainingId: true, workspace: { select: { name: true } } },
  })
  console.log(`${stale.length} rule(s) with stale rule.trainingId\n`)
  for (const r of stale) {
    console.log(`  [${r.workspace.name}] ${r.name}  (trigger=${r.triggerType})  trainingId=${r.trainingId}`)
  }
  if (!APPLY) { console.log('\n(dry-run — pass --apply to clear)'); return }
  const updated = await prisma.automationRule.updateMany({
    where: {
      trainingId: { not: null },
      triggerType: { notIn: ['training_started', 'training_completed'] },
    },
    data: { trainingId: null },
  })
  console.log(`\ncleared ${updated.count} row(s)`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
