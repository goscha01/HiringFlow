/**
 * GET /api/interview-meetings/[id]/recording
 *
 * Stream the Meet recording through the server so the candidate/recruiter
 * does not need Drive ACLs on the file. Two auth paths:
 *   1. Session-authenticated user in the same workspace (for dashboard playback).
 *   2. Signed artifact token in the ?t= query string (for email links).
 *
 * Range requests are forwarded to Drive so HTML5 <video> scrubbing works.
 */

import { NextRequest } from 'next/server'
import { getWorkspaceSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAuthedClientForWorkspace } from '@/lib/google'
import { streamFile } from '@/lib/meet/google-drive'
import { verifyArtifactToken } from '@/lib/meet/pubsub-jwt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const meeting = await prisma.interviewMeeting.findUnique({
    where: { id: params.id },
    select: { id: true, workspaceId: true, driveRecordingFileId: true, recordingState: true },
  })
  if (!meeting) return new Response('Not found', { status: 404 })
  if (!meeting.driveRecordingFileId || meeting.recordingState !== 'ready') {
    return new Response('Recording not available', { status: 404 })
  }

  let authorized = false
  const tokenParam = request.nextUrl.searchParams.get('t')
  if (tokenParam) {
    const payload = verifyArtifactToken(tokenParam)
    if (payload && payload.meetingId === meeting.id && payload.kind === 'recording') {
      authorized = true
    }
  }
  if (!authorized) {
    const ws = await getWorkspaceSession()
    if (ws && ws.workspaceId === meeting.workspaceId) authorized = true
  }
  if (!authorized) return new Response('Unauthorized', { status: 401 })

  const authed = await getAuthedClientForWorkspace(meeting.workspaceId)
  if (!authed) return new Response('Google account not connected', { status: 409 })

  const range = request.headers.get('range')
  try {
    return await streamFile(authed.client, meeting.driveRecordingFileId, range)
  } catch (err) {
    console.error('[Artifact] recording stream failed:', err)
    return new Response('Recording fetch failed', { status: 502 })
  }
}
