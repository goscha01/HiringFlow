import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
;(async () => {
  const SID = '11574fb1-6991-4342-87fc-651e67ad38b7'
  const s = await prisma.session.findUnique({ where: { id: SID }, select: { pipelineStatus: true, rejectionReason: true } })
  console.log('pipelineStatus:', s?.pipelineStatus, ' rejectionReason:', s?.rejectionReason)
  const m = await prisma.interviewMeeting.findFirst({ where: { sessionId: SID }, orderBy: { createdAt: 'desc' } })
  console.log('actualStart:', m?.actualStart?.toISOString())
  console.log('actualEnd:', m?.actualEnd?.toISOString())
  console.log('recordingState:', m?.recordingState, ' transcriptState:', m?.transcriptState)
  console.log('driveGeminiNotesFileId:', m?.driveGeminiNotesFileId)
  console.log('driveRecordingFileId:', m?.driveRecordingFileId)
  console.log('attendanceSheetFileId:', m?.attendanceSheetFileId)
  console.log('meetApiSyncedAt:', m?.meetApiSyncedAt?.toISOString())
  const evts = await prisma.schedulingEvent.findMany({
    where: { sessionId: SID, eventType: { in: ['meeting_started','meeting_ended','meeting_no_show'] } },
    orderBy: { eventAt: 'asc' },
    select: { eventType: true, eventAt: true, metadata: true },
  })
  console.log('lifecycle events:', evts.length)
  for (const e of evts) console.log(' -', e.eventAt.toISOString(), e.eventType, JSON.stringify(e.metadata))
  await prisma.$disconnect()
})()
