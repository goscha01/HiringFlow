/**
 * GET /api/candidates/[id]/interview-meetings
 *
 * Returns all Meet-v2 InterviewMeeting rows for a candidate, for use by the
 * candidate detail UI (InterviewPanel). Ordered newest first.
 */

import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: { id: true },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
      participants: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ meetings })
}
