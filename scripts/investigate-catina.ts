import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { candidateName: { contains: 'catina', mode: 'insensitive' } },
        { candidateName: { contains: 'robinson', mode: 'insensitive' } },
      ],
    },
    include: {
      workspace: { select: { name: true } },
      flow: { select: { name: true } },
      schedulingEvents: { orderBy: { eventAt: 'desc' }, take: 30 },
      interviewMeetings: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { startedAt: 'desc' },
  })

  for (const s of sessions) {
    console.log('\n' + '='.repeat(140))
    console.log(`${s.candidateName}  ${s.candidateEmail}  ${s.candidatePhone ?? ''}`)
    console.log(`  sessionId        : ${s.id}`)
    console.log(`  workspace        : ${s.workspace?.name}`)
    console.log(`  flow             : ${s.flow?.name}`)
    console.log(`  pipelineStatus   : ${s.pipelineStatus}`)
    console.log(`  outcome          : ${s.outcome}`)
    console.log(`  rejectionReason  : ${s.rejectionReason}  ${s.rejectionReasonAt?.toISOString() ?? ''}`)
    console.log(`  startedAt        : ${s.startedAt.toISOString()}`)
    console.log(`  lastActivityAt   : ${s.lastActivityAt?.toISOString() ?? '—'}`)

    if (s.interviewMeetings.length) {
      console.log(`  meetings:`)
      for (const m of s.interviewMeetings) {
        console.log(`    ${m.id}`)
        console.log(`      scheduledStart : ${m.scheduledStart?.toISOString() ?? '—'}`)
        console.log(`      actualStart    : ${m.actualStart?.toISOString() ?? '—'}`)
        console.log(`      actualEnd      : ${m.actualEnd?.toISOString() ?? '—'}`)
        console.log(`      meetSpaceName  : ${m.meetSpaceName ?? '—'}`)
        console.log(`      meetApiSyncedAt: ${m.meetApiSyncedAt?.toISOString() ?? '—'}`)
      }
    }

    console.log(`  events (last 30):`)
    for (const e of s.schedulingEvents) {
      const md = e.metadata as Record<string, unknown> | null
      const tag = md ? ` ${JSON.stringify(md)}`.slice(0, 200) : ''
      console.log(`    ${e.eventAt.toISOString()}  ${e.eventType}${tag}`)
    }
  }
  await prisma.$disconnect()
}
main().catch(console.error)
