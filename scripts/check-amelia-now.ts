import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

;(async () => {
  const session = await prisma.session.findUnique({
    where: { id: '433fef99-9a99-4952-b7b5-498b2f7306f1' },
    include: {
      interviewMeetings: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          meetingCode: true,
          meetingUri: true,
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
          actualEnd: true,
          recordingState: true,
          confirmedAt: true,
          participants: true,
          meetApiSyncedAt: true,
          attendanceSheetFileId: true,
        },
      },
      schedulingEvents: {
        orderBy: { eventAt: 'desc' },
        take: 30,
        select: { eventAt: true, eventType: true, metadata: true },
      },
    },
  })

  if (!session) { console.log('session not found'); process.exit(0) }
  console.log(`Session: ${session.id}`)
  console.log(`  name=${session.candidateName} email=${session.candidateEmail}`)
  console.log(`  pipelineStatus=${session.pipelineStatus}`)
  console.log(`  rejectionReason=${session.rejectionReason ?? '—'}`)
  console.log(`  outcome=${session.outcome ?? '—'}`)

  const meeting = session.interviewMeetings[0]
  if (!meeting) { console.log('no meeting on file'); }
  else {
    console.log(`\nMeeting: ${meeting.id}`)
    console.log(`  meetingCode    : ${meeting.meetingCode}`)
    console.log(`  meetingUri     : ${meeting.meetingUri}`)
    console.log(`  scheduledStart : ${meeting.scheduledStart.toISOString()}`)
    console.log(`  scheduledEnd   : ${meeting.scheduledEnd.toISOString()}`)
    console.log(`  actualStart    : ${meeting.actualStart?.toISOString() ?? '—'}`)
    console.log(`  actualEnd      : ${meeting.actualEnd?.toISOString() ?? '—'}`)
    console.log(`  recordingState : ${meeting.recordingState}`)
    console.log(`  confirmedAt    : ${meeting.confirmedAt?.toISOString() ?? '—'}`)
    console.log(`  meetApiSync    : ${meeting.meetApiSyncedAt?.toISOString() ?? '—'}`)
    console.log(`  attendSheet    : ${meeting.attendanceSheetFileId ?? '—'}`)
    console.log(`  participants   :`)
    const parts = Array.isArray(meeting.participants) ? meeting.participants as any[] : []
    if (parts.length === 0) console.log('    (none)')
    for (const p of parts) {
      console.log(`    - ${JSON.stringify(p)}`)
    }
  }

  console.log(`\nLast 30 events:`)
  for (const e of session.schedulingEvents) {
    const meta = e.metadata && typeof e.metadata === 'object' ? JSON.stringify(e.metadata) : ''
    console.log(`  ${e.eventAt.toISOString()}  ${e.eventType.padEnd(22)}  ${meta}`)
  }

  await prisma.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
