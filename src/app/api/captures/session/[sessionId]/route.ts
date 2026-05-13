import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { listSessionCaptures } from '@/lib/capture/capture-response.service'
import { checkCaptureRateLimit, extractIp } from '@/lib/capture/capture-rate-limit'
import { presignCapturePlayback } from '@/lib/capture/capture-storage.service'

// Recruiter-facing list endpoint. Returns all CaptureResponse rows for a
// session belonging to the caller's workspace. Default behavior collapses to
// one row per step (latest active take); pass ?includeRetakes=1 to get the
// full retake history.
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const auth = await getWorkspaceSession()
  if (!auth) return unauthorized()

  const rl = checkCaptureRateLimit({
    route: 'list',
    ip: extractIp(request),
    workspaceId: auth.workspaceId,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  // Verify the session belongs to the caller's workspace before we list. A
  // session id from another workspace returns 404 rather than 403 so we
  // don't confirm its existence.
  const session = await prisma.session.findUnique({
    where: { id: params.sessionId },
    select: { id: true, workspaceId: true },
  })
  if (!session || session.workspaceId !== auth.workspaceId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const includeRetakes = url.searchParams.get('includeRetakes') === '1'

  const rows = await listSessionCaptures({
    workspaceId: auth.workspaceId,
    sessionId: params.sessionId,
    includeRetakes,
  })

  // Mint signed playback URLs server-side so the candidate page can render
  // the <audio>/<video> element inline without a "Load playback" click.
  // Each URL is short-lived (5min, clamped in presignCapturePlayback) —
  // the recorder UX should match the rest of the candidate dashboard where
  // videos / meetings appear inline. A page kept open past the TTL just
  // requires a refresh.
  //
  // Only signed for rows that actually have media (storageKey present,
  // status in a playable state). Other rows return playbackUrl: null so
  // the client can render an "in progress" / "failed" placeholder.
  const PLAYABLE_STATUSES = new Set(['processed', 'processing', 'uploaded'])
  const captures = await Promise.all(
    rows.map(async (r) => {
      let playbackUrl: string | null = null
      let playbackExpiresAt: string | null = null
      if (r.storageKey && PLAYABLE_STATUSES.has(r.status)) {
        try {
          const signed = await presignCapturePlayback({
            key: r.storageKey,
            mimeType: r.mimeType ?? undefined,
          })
          playbackUrl = signed.url
          playbackExpiresAt = signed.expiresAt.toISOString()
        } catch (err) {
          // Don't fail the whole list if one URL can't be signed — surface
          // the row with playbackUrl=null so the UI can show a retry CTA.
          console.error('[captures/list] signing failed', { captureId: r.id, err })
        }
      }
      return {
        id: r.id,
        stepId: r.stepId,
        mode: r.mode,
        prompt: r.prompt,
        status: r.status,
        mimeType: r.mimeType,
        fileSizeBytes: r.fileSizeBytes,
        durationSec: r.durationSec,
        transcript: r.transcript,
        aiSummary: r.aiSummary,
        aiScore: r.aiScore,
        errorMessage: r.errorMessage,
        captureOrdinal: r.captureOrdinal,
        playbackUrl,
        playbackExpiresAt,
        shareToken: r.shareToken,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }
    })
  )

  return NextResponse.json(
    { captures },
    {
      // Don't cache — signed URLs expire in 5 min, every list call should
      // mint fresh ones. Same Cache-Control as the playback endpoint.
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      },
    }
  )
}
