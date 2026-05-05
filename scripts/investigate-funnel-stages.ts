/**
 * Read-only: print the workspace's custom funnel stages so we can see how
 * pipelineStatus values map to kanban columns.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const ws = await prisma.workspace.findUnique({
    where: { id: '739bcd71-69fd-4b30-a39e-242521b7ab20' },
    select: { id: true, name: true, settings: true },
  })
  if (!ws) { console.log('workspace not found'); return }
  console.log('workspace:', ws.name)
  const settings = ws.settings as Record<string, unknown> | null
  console.log('\nfunnelStages:')
  console.log(JSON.stringify(settings?.funnelStages ?? null, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
