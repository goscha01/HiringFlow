import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const sid = 'dc095992-adbc-4035-b8da-6088b0649195'
  const all = await prisma.schedulingEvent.findMany({
    where: { sessionId: sid },
    orderBy: { eventAt: 'asc' },
    select: { eventType: true, eventAt: true, metadata: true },
  })
  console.log('ALL scheduling events for Catina:')
  for (const e of all) console.log(`  ${e.eventAt.toISOString()}  ${e.eventType}  ${JSON.stringify(e.metadata)}`)
  const s = await prisma.session.findUnique({ where: { id: sid }, select: { rejectionReason: true, rejectionReasonAt: true, pipelineStatus: true } })
  console.log('\nSESSION fields:', s)
}
main().catch(console.error).finally(() => prisma.$disconnect())
