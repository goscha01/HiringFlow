/**
 * POST /api/interview-meetings/[id]/remove-recording
 *
 * Detaches the Meet recording from the candidate profile by clearing the
 * Drive file id reference and resetting recordingState to 'unavailable'. The
 * underlying file in the user's Google Drive is NOT touched — current OAuth
 * scopes are read-only (drive.meet.readonly), so deletion would 403. The
 * recruiter can delete the file manually from Drive if they want it gone
 * there too.
 */

import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const meeting = await prisma.interviewMeeting.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: { id: true, driveRecordingFileId: true, recordingState: true },
  })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!meeting.driveRecordingFileId && meeting.recordingState === 'unavailable') {
    return NextResponse.json({ ok: true, alreadyRemoved: true })
  }

  await prisma.interviewMeeting.update({
    where: { id: meeting.id },
    data: {
      driveRecordingFileId: null,
      recordingState: 'unavailable',
    },
  })

  return NextResponse.json({ ok: true, alreadyRemoved: false })
}
