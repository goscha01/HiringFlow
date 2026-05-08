/**
 * Check Georgiy's pending automation executions for the 10 PM ET meeting
 * tonight. Verify nothing is queued for the wrong time.
 *
 * Usage:
 *   npx tsx --env-file=.env.diagnose scripts/check-georgiy-pending.ts
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const sessionId = '157f9f20-bf33-4970-96bd-89790acfaa00'
  const meetings = await prisma.interviewMeeting.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, scheduledStart: true, createdAt: true },
  })
  console.log('Meetings (chronological):')
  for (const m of meetings) console.log(`  ${m.id}  scheduledStart=${m.scheduledStart?.toISOString()}  createdAt=${m.createdAt.toISOString()}`)

  console.log('\nPending/queued executions:')
  const execs = await prisma.automationExecution.findMany({
    where: { sessionId, status: { in: ['queued', 'pending', 'waiting_for_recording'] } },
    orderBy: { scheduledFor: 'asc' },
    include: {
      automationRule: { select: { name: true, triggerType: true } },
      step: { select: { order: true, delayMinutes: true, timingMode: true } },
    },
  })
  for (const x of execs) {
    console.log(`  ${x.id}  rule=${x.automationRule?.name}  step=order${x.step?.order}/${x.step?.delayMinutes}m/${x.step?.timingMode}  channel=${x.channel}  status=${x.status}  scheduledFor=${x.scheduledFor?.toISOString()}  qstashId=${x.qstashMessageId}`)
  }
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
