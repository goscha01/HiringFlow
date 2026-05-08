import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const WS = '739bcd71-69fd-4b30-a39e-242521b7ab20' // Spotless
const STAGE = 'stage_8_2' // Background check
;(async () => {
  const all = await prisma.automationRule.findMany({
    where: { workspaceId: WS, isActive: true },
    select: { id: true, name: true, triggerType: true, stageId: true, flowId: true },
    orderBy: { createdAt: 'asc' },
  })
  const pinned = all.filter((r) => r.stageId === STAGE)
  const stageEvents: string[] = ['background_check_passed', 'background_check_failed', 'background_check_needs_review']
  const triggerMatch = all.filter((r) => r.stageId === null && stageEvents.includes(r.triggerType))
  console.log(`\nAll active rules in workspace: ${all.length}`)
  console.log(`Rules explicitly pinned to ${STAGE}: ${pinned.length}`)
  for (const r of pinned) console.log(`   - ${r.name}  (trigger=${r.triggerType})`)
  console.log(`Rules that WOULD match stage_8_2 if it had bg-check triggers configured: ${triggerMatch.length}`)
  for (const r of triggerMatch) console.log(`   - ${r.name}  (trigger=${r.triggerType})`)
  await prisma.$disconnect()
})()
