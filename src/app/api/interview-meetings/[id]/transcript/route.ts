/**
 * GET /api/interview-meetings/[id]/transcript
 *
 * Transcripts land as Google Docs, which can't be fetched via files.get
 * alt=media (Drive returns 403 for Docs binaries). Instead we resolve the
 * file's webViewLink and 302 to Google Docs — the recruiter is already
 * signed into the same Google account that owns the doc, so they get
 * straight in.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAuthedClientForWorkspace } from '@/lib/google'
import { getFileMeta } from '@/lib/meet/google-drive'
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
    const meta = await getFileMeta(authed.client, meeting.driveTranscriptFileId)
    if (!meta.webViewLink) return new Response('Transcript link unavailable', { status: 502 })
    return NextResponse.redirect(meta.webViewLink, 302)
  } catch (err) {
    console.error('[Artifact] transcript redirect failed:', err)
    return new Response('Transcript fetch failed', { status: 502 })
  }
}
