/**
 * GET /api/interview-meetings/[id]/transcript
 *
 * Same contract as /recording but for the transcript Doc. Transcripts land as
 * Google Docs documents; we serve them as text/html by fetching via Drive's
 * files.get with alt=media (Google auto-exports text/html for Docs).
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
    select: { id: true, workspaceId: true, driveTranscriptFileId: true, transcriptState: true },
  })
  if (!meeting) return new Response('Not found', { status: 404 })
  if (!meeting.driveTranscriptFileId || meeting.transcriptState !== 'ready') {
    return new Response('Transcript not available', { status: 404 })
  }

  let authorized = false
  const tokenParam = request.nextUrl.searchParams.get('t')
  if (tokenParam) {
    const payload = verifyArtifactToken(tokenParam)
    if (payload && payload.meetingId === meeting.id && payload.kind === 'transcript') {
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

  try {
    return await streamFile(authed.client, meeting.driveTranscriptFileId, null)
  } catch (err) {
    console.error('[Artifact] transcript stream failed:', err)
    return new Response('Transcript fetch failed', { status: 502 })
  }
}
