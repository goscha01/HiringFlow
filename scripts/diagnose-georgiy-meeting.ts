import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const wsId = '739bcd71-69fd-4b30-a39e-242521b7ab20'
  const sessions = await prisma.session.findMany({
    where: {
      workspaceId: wsId,
      OR: [
        { candidateName: { contains: 'georgiy', mode: 'insensitive' } },
        { candidateName: { contains: 'sayapin', mode: 'insensitive' } },
        { candidateEmail: { contains: 'sayapin', mode: 'insensitive' } },
      ],
    },
    select: { id: true, candidateName: true, candidateEmail: true, pipelineStatus: true, startedAt: true },
    orderBy: { startedAt: 'desc' },
    take: 5,
  })
  console.log('SESSIONS:'); for (const s of sessions) console.log(' ', s)
  if (sessions.length === 0) return

  for (const s of sessions) {
    const meetings = await prisma.interviewMeeting.findMany({
      where: { sessionId: s.id },
      orderBy: { scheduledStart: 'desc' },
      select: {
        id: true, scheduledStart: true, scheduledEnd: true, actualStart: true, actualEnd: true,
        recordingState: true, recordingEnabled: true, driveRecordingFileId: true,
        transcriptState: true, driveTranscriptFileId: true,
        driveGeminiNotesFileId: true, attendanceSheetFileId: true,
        meetApiSyncedAt: true, meetSpaceName: true, meetingUri: true,
      },
    })
    console.log(`\n[${s.candidateName}] meetings (${meetings.length}):`)
    for (const m of meetings) console.log(' ', m)

    const events = await prisma.schedulingEvent.findMany({
      where: { sessionId: s.id, eventType: { in: ['meeting_scheduled','meeting_started','meeting_ended','meeting_no_show','attendance_uploaded','recording_ready','transcript_ready'] } },
      orderBy: { eventAt: 'asc' },
      select: { eventType: true, eventAt: true, metadata: true },
    })
    console.log(`\n[${s.candidateName}] events (${events.length}):`)
    for (const e of events) console.log(`  ${e.eventAt.toISOString()} ${e.eventType}  ${JSON.stringify(e.metadata)}`)
  }

  const integ = await prisma.googleIntegration.findUnique({
    where: { workspaceId: wsId },
    select: {
      hostedDomain: true, attendanceExtensionEnabled: true, grantedScopes: true,
      meetRecordingsFolderId: true, googleDisplayName: true, googleUserId: true, googleEmail: true,
    },
  })
  console.log('\nINTEGRATION:', integ)
}
main().catch(console.error).finally(() => prisma.$disconnect())
