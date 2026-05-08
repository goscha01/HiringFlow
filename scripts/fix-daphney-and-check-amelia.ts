import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

;(async () => {
  // Find Daphney's session(s)
  const daphney = await prisma.session.findMany({
    where: { candidateName: { contains: 'Daphney', mode: 'insensitive' } },
    select: { id: true, candidateName: true, candidateEmail: true, pipelineStatus: true },
  })
  console.log('\nDaphney candidates:')
  for (const d of daphney) {
    console.log(`  ${d.id}  name="${d.candidateName}"  email="${d.candidateEmail}"  status=${d.pipelineStatus}`)
  }

  if (APPLY) {
    for (const d of daphney) {
      if (d.candidateEmail && d.candidateEmail.endsWith('@gmail.comd')) {
        const fixed = d.candidateEmail.replace(/@gmail\.comd$/, '@gmail.com')
        await prisma.session.update({ where: { id: d.id }, data: { candidateEmail: fixed } })
        console.log(`  fixed: ${d.candidateEmail} → ${fixed}`)
      }
    }
  }

  // Look at all Amelia Plaza sessions
  const amelias = await prisma.session.findMany({
    where: {
      OR: [
        { candidateName: { contains: 'Amelia', mode: 'insensitive' } },
        { candidateEmail: { contains: 'plazaamelia', mode: 'insensitive' } },
      ],
    },
    include: {
      flow: { select: { name: true } },
      schedulingEvents: { orderBy: { eventAt: 'desc' }, take: 8, select: { eventAt: true, eventType: true } },
      interviewMeetings: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, scheduledStart: true, actualStart: true, actualEnd: true } },
    },
    orderBy: { startedAt: 'asc' },
  })
  console.log(`\nAmelia Plaza sessions: ${amelias.length}`)
  for (const a of amelias) {
    console.log(`\n  sessionId       : ${a.id}`)
    console.log(`  name            : ${a.candidateName}`)
    console.log(`  email           : ${a.candidateEmail}`)
    console.log(`  flow            : ${a.flow?.name}`)
    console.log(`  pipelineStatus  : ${a.pipelineStatus}`)
    console.log(`  startedAt       : ${a.startedAt.toISOString()}`)
    console.log(`  finishedAt      : ${a.finishedAt?.toISOString() ?? '—'}`)
    if (a.interviewMeetings.length) {
      console.log(`  meetings:`)
      for (const m of a.interviewMeetings) {
        console.log(`    scheduledStart=${m.scheduledStart?.toISOString() ?? '—'}  actualStart=${m.actualStart?.toISOString() ?? '—'}  actualEnd=${m.actualEnd?.toISOString() ?? '—'}`)
      }
    }
    console.log(`  recent events:`)
    for (const e of a.schedulingEvents) {
      console.log(`    ${e.eventAt.toISOString()}  ${e.eventType}`)
    }
  }

  await prisma.$disconnect()
})().catch(console.error)
