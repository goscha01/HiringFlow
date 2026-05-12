import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import {
  CaptureError,
  loadCaptureForWorkspace,
} from '@/lib/capture/capture-response.service'
import { presignCapturePlayback } from '@/lib/capture/capture-storage.service'
import { parseCaptureStorageKey } from '@/lib/capture/capture-storage.service'
import { captureLog } from '@/lib/capture/capture-log'
import { checkCaptureRateLimit, extractIp } from '@/lib/capture/capture-rate-limit'

// Recruiter-facing playback signer. Returns a short-lived signed S3 GET URL
// for the requested CaptureResponse. The caller must be authenticated and
// belong to the capture's workspace.
//
// Returns: { url, expiresAt, mimeType, status, durationSec }
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getWorkspaceSession()
  if (!session) return unauthorized()

  // Per-IP + per-workspace rate limit. Recruiter UIs may re-bind audio
  // elements aggressively; the per-workspace ceiling backstops the case
  // where many recruiters in the same workspace browse simultaneously.
  const rl = checkCaptureRateLimit({
    route: 'playback',
    ip: extractIp(request),
    workspaceId: session.workspaceId,
  })
  if (!rl.ok) {
    captureLog('capture_playback_failed', {
      captureId: params.id,
      workspaceId: session.workspaceId,
      reason: 'rate_limited',
      scope: rl.scope,
    })
    return NextResponse.json(
      { error: 'Too many playback requests. Please wait a moment.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  try {
    const capture = await loadCaptureForWorkspace({
      captureId: params.id,
      workspaceId: session.workspaceId,
    })

    if (!capture.storageKey) {
      return NextResponse.json({ error: 'Capture has no playable media yet' }, { status: 409 })
    }
    if (capture.status !== 'processed' && capture.status !== 'uploaded' && capture.status !== 'processing') {
      // Belt-and-braces: refuse to sign for rows that haven't actually
      // received an upload yet (draft, uploading, failed). The recruiter UI
      // surfaces these states without calling this route, but a curl-by-hand
      // shouldn't sneak past.
      return NextResponse.json(
        { error: `Capture is not ready for playback (status=${capture.status})` },
        { status: 409 }
      )
    }

    // Double-check the storageKey's tenant scope matches the capture's
    // workspaceId. The key is server-generated so this should always pass,
    // but defending in depth costs nothing.
    const parsed = parseCaptureStorageKey(capture.storageKey)
    if (!parsed || parsed.workspaceId !== capture.workspaceId) {
      console.error('[captures/playback] storage key tenant mismatch', {
        captureId: capture.id,
        storageKey: capture.storageKey,
      })
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    // Mint a fresh signed URL every call — never store or cache one. The
    // service layer also clamps the TTL to PLAYBACK_MAX_EXPIRES_SEC so a
    // bug in a future caller can't extend it.
    const { url, expiresAt } = await presignCapturePlayback({
      key: capture.storageKey,
      mimeType: capture.mimeType ?? undefined,
    })

    captureLog('capture_playback_signed', {
      captureId: capture.id,
      workspaceId: capture.workspaceId,
      mode: capture.mode,
      mimeType: capture.mimeType ?? undefined,
    })

    return NextResponse.json(
      {
        url,
        expiresAt: expiresAt.toISOString(),
        mimeType: capture.mimeType,
        status: capture.status,
        durationSec: capture.durationSec,
      },
      {
        // Prevent the signed URL from being cached by browsers, CDNs, or
        // intermediate proxies. The URL is a bearer credential — caching
        // would extend its effective lifetime past our 5-minute ceiling.
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache',
        },
      }
    )
  } catch (err) {
    if (err instanceof CaptureError) {
      captureLog('capture_playback_failed', {
        captureId: params.id,
        reason: err.message,
        errorCode: err.code,
        statusCode: err.status,
      })
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('[captures/playback] unexpected error', err)
    captureLog('capture_playback_failed', {
      captureId: params.id,
      reason: (err as any)?.message || 'unknown',
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
