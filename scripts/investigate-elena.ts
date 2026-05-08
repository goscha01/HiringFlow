import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

;(async () => {
  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { candidateName: { contains: 'elena', mode: 'insensitive' } },
        { candidateName: { contains: 'bobb', mode: 'insensitive' } },
      ],
    },
    include: {
      workspace: { select: { name: true } },
      flow: { select: { name: true } },
      trainingEnrollments: {
        include: { training: { select: { id: true, title: true, sections: { select: { id: true } } } } },
        orderBy: { startedAt: 'desc' },
      },
      trainingAccessTokens: {
        select: { id: true, trainingId: true, token: true, createdAt: true, expiresAt: true, usedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      schedulingEvents: { orderBy: { eventAt: 'desc' }, take: 30 },
      interviewMeetings: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { startedAt: 'desc' },
  })

  console.log(`\nFound ${sessions.length} session(s)`)
  for (const s of sessions) {
    console.log('\n' + '='.repeat(140))
    console.log(`${s.candidateName}  ${s.candidateEmail}  ${s.candidatePhone ?? ''}`)
    console.log(`  sessionId        : ${s.id}`)
    console.log(`  workspace        : ${s.workspace?.name}`)
    console.log(`  flow             : ${s.flow?.name}`)
    console.log(`  pipelineStatus   : ${s.pipelineStatus}`)
    console.log(`  outcome          : ${s.outcome}`)
    console.log(`  rejectionReason  : ${s.rejectionReason} ${s.rejectionReasonAt?.toISOString() ?? ''}`)
    console.log(`  startedAt        : ${s.startedAt.toISOString()}`)
    console.log(`  lastActivityAt   : ${s.lastActivityAt?.toISOString() ?? '—'}`)

    if (s.trainingEnrollments.length) {
      console.log(`  trainingEnrollments:`)
      for (const e of s.trainingEnrollments) {
        const prog = (e.progress as { completedSections?: string[] } | null) || null
        const done = prog?.completedSections?.length ?? 0
        const total = e.training.sections.length
        console.log(`    - ${e.training.title}  status=${e.status}  ${done}/${total}  started=${e.startedAt.toISOString()}  completed=${e.completedAt?.toISOString() ?? '—'}`)
        console.log(`        enrollmentId=${e.id}  trainingId=${e.training.id}`)
      }
    } else {
      console.log(`  trainingEnrollments: NONE`)
    }

    if (s.trainingAccessTokens.length) {
      console.log(`  trainingAccessTokens (most recent ${s.trainingAccessTokens.length}):`)
      for (const t of s.trainingAccessTokens) {
        console.log(`    - trainingId=${t.trainingId}  created=${t.createdAt.toISOString()}  used=${t.usedAt?.toISOString() ?? '—'}  expires=${t.expiresAt?.toISOString() ?? '—'}`)
      }
    }

    if (s.interviewMeetings.length) {
      console.log(`  interviewMeetings:`)
      for (const m of s.interviewMeetings) {
        console.log(`    - scheduledStart=${m.scheduledStart?.toISOString() ?? '—'}  actualStart=${m.actualStart?.toISOString() ?? '—'}  actualEnd=${m.actualEnd?.toISOString() ?? '—'}`)
      }
    }

    console.log(`  events (last 30):`)
    for (const e of s.schedulingEvents) {
      const md = e.metadata as Record<string, unknown> | null
      const tag = md ? ` ${JSON.stringify(md)}`.slice(0, 200) : ''
      console.log(`    ${e.eventAt.toISOString()}  ${e.eventType}${tag}`)
    }
  }

  // Also pull her automation executions
  for (const s of sessions) {
    const execs = await prisma.automationExecution.findMany({
      where: { sessionId: s.id },
      include: { automationRule: { select: { name: true, triggerType: true, stageId: true } } },
      orderBy: { createdAt: 'asc' },
    })
    console.log(`\n--- Executions for ${s.candidateName} (${execs.length}) ---`)
    for (const x of execs) {
      console.log(`  ${x.createdAt.toISOString()}  status=${x.status}  channel=${x.channel}  rule=${x.automationRule?.name}  trigger=${x.automationRule?.triggerType}  stageId=${x.automationRule?.stageId ?? '—'}`)
    }
  }

  await prisma.$disconnect()
})().catch(console.error)
