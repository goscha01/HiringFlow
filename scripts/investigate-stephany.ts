/**
 * Find Stephany — recruiter says she "lost" her after training.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/investigate-stephany.ts dotenv_config_path=.env.diagnose
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function pad(s: string | null | undefined, n: number) {
  return (s || '—').toString().padEnd(n).slice(0, n)
}

async function main() {
  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { candidateName: { contains: 'stephany', mode: 'insensitive' } },
        { candidateName: { contains: 'stephanie', mode: 'insensitive' } },
        { candidateEmail: { contains: 'stephany', mode: 'insensitive' } },
        { candidateEmail: { contains: 'stephanie', mode: 'insensitive' } },
      ],
    },
    include: {
      workspace: { select: { id: true, name: true } },
      flow: { select: { id: true, name: true } },
      trainingEnrollments: {
        include: { training: { select: { title: true, sections: { select: { id: true } } } } },
      },
      schedulingEvents: {
        orderBy: { eventAt: 'desc' },
        take: 15,
        select: { eventType: true, eventAt: true, metadata: true },
      },
      interviewMeetings: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true, scheduledStart: true, actualStart: true, actualEnd: true,
          recordingState: true, transcriptState: true,
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  })

  console.log(`\nFound ${sessions.length} matching session(s)\n`)
  console.log('='.repeat(140))

  for (const s of sessions) {
    console.log(`\n${pad(s.candidateName, 28)} ${pad(s.candidateEmail, 36)} ${pad(s.candidatePhone, 16)}`)
    console.log(`  sessionId      : ${s.id}`)
    console.log(`  workspace      : ${s.workspace?.name}  (${s.workspaceId})`)
    console.log(`  flow           : ${s.flow?.name}  (${s.flowId})`)
    console.log(`  pipelineStatus : ${s.pipelineStatus}`)
    console.log(`  outcome        : ${s.outcome}`)
    console.log(`  rejectionReason: ${s.rejectionReason}  ${s.rejectionReasonAt?.toISOString() ?? ''}`)
    console.log(`  startedAt      : ${s.startedAt.toISOString()}`)
    console.log(`  finishedAt     : ${s.finishedAt?.toISOString() ?? '—'}`)
    console.log(`  lastActivityAt : ${s.lastActivityAt?.toISOString() ?? '—'}`)

    if (s.trainingEnrollments.length) {
      console.log(`  trainings      :`)
      for (const e of s.trainingEnrollments) {
        const prog = (e.progress as { completedSections?: string[] } | null) || null
        const done = prog?.completedSections?.length ?? 0
        const total = e.training.sections.length
        console.log(`    - ${pad(e.training.title, 32)} status=${pad(e.status, 14)} ${done}/${total}  started=${e.startedAt.toISOString()}  completed=${e.completedAt?.toISOString() ?? '—'}`)
      }
    }

    if (s.interviewMeetings.length) {
      console.log(`  meetings       :`)
      for (const m of s.interviewMeetings) {
        console.log(`    - ${m.id}  scheduled=${m.scheduledStart?.toISOString() ?? '—'}  actualStart=${m.actualStart?.toISOString() ?? '—'}  actualEnd=${m.actualEnd?.toISOString() ?? '—'}`)
      }
    }

    if (s.schedulingEvents.length) {
      console.log(`  recent events  :`)
      for (const e of s.schedulingEvents) {
        console.log(`    - ${e.eventAt.toISOString()}  ${e.eventType}`)
      }
    }
    console.log('-'.repeat(140))
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect()
  process.exit(1)
})
