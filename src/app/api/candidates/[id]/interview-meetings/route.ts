/**
 * GET /api/candidates/[id]/interview-meetings
 *
 * Returns all Meet-v2 InterviewMeeting rows for a candidate, for use by the
 * candidate detail UI (InterviewPanel). Ordered newest first.
 */

import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncMeetingFromMeetApi } from '@/lib/meet/sync-on-read'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: { id: true },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Pull current Meet API state for each meeting before returning — covers
  // tenants where the Workspace Events webhook never fires (personal Gmail).
  const stale = await prisma.interviewMeeting.findMany({
    where: { sessionId: session.id },
    select: {
      id: true, workspaceId: true, sessionId: true, meetSpaceName: true,
      scheduledStart: true, scheduledEnd: true, actualStart: true, actualEnd: true,
      recordingState: true, transcriptState: true,
      meetApiSyncedAt: true, attendanceSheetFileId: true,
    },
  })
  await Promise.all(stale.map((m) => syncMeetingFromMeetApi(m).catch((err) =>
    console.error('[candidates.interview-meetings] sync failed for', m.id, ':', err),
  )))

  const meetings = await prisma.interviewMeeting.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      meetingUri: true,
      meetingCode: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      actualEnd: true,
      recordingEnabled: true,
      recordingState: true,
      recordingProvider: true,
      transcriptState: true,
      driveRecordingFileId: true,
      driveTranscriptFileId: true,
      driveGeminiNotesFileId: true,
      attendanceSheetFileId: true,
      participants: true,
      confirmedAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ meetings })
}
