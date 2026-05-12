import { NextRequest, NextResponse } from 'next/server'
import {
  createCaptureForUpload,
  CaptureError,
} from '@/lib/capture/capture-response.service'
import { presignCaptureUpload } from '@/lib/capture/capture-storage.service'
import type { CaptureMode } from '@/lib/capture/capture-config'
import { captureLog } from '@/lib/capture/capture-log'
import { checkCaptureRateLimit, extractIp } from '@/lib/capture/capture-rate-limit'
import {
  isCaptureStepsEnabled,
  isCaptureStepsEnabledForWorkspace,
} from '@/lib/capture/capture-feature-flag'
import { prisma } from '@/lib/prisma'

// Public candidate-facing route. Auth model mirrors the existing public flow
// endpoints (e.g. /api/public/sessions/[sessionId]/submit): the sessionId
// UUID in the URL is the bearer credential. The candidate received it via
// their /f/[slug]/s/[sessionId] URL when they started the flow.
//
// Body: { stepId, mode, mimeType }
// Returns: { captureId, uploadUrl, storageKey, expiresAt }
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  // Global feature flag kill switch. Fast-fail before any DB I/O so the
  // emergency disable cuts load too. Workspace-level gate is checked further
  // below after we've loaded the session — we need the workspaceId to know
  // which settings to consult.
  if (!isCaptureStepsEnabled()) {
    captureLog('capture_upload_failed', {
      sessionId: params.sessionId,
      reason: 'feature_disabled',
    })
    return NextResponse.json(
      { error: 'Capture uploads are temporarily disabled.', code: 'feature_disabled' },
      { status: 503 }
    )
  }

  // Per-IP + per-session rate limit. Generous limits — a fast retake loop
  // is fine. Backstops runaway scripts and accidental DOS.
  const ip = extractIp(request)
  const rl = checkCaptureRateLimit({ route: 'presign', ip, sessionId: params.sessionId })
  if (!rl.ok) {
    captureLog('capture_upload_failed', {
      sessionId: params.sessionId,
      reason: 'rate_limited',
      scope: rl.scope,
    })
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  try {
    const body = await request.json().catch(() => null) as
      | { stepId?: string; mode?: string; mimeType?: string }
      | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { stepId, mode, mimeType } = body
    if (!stepId || typeof stepId !== 'string') {
      return NextResponse.json({ error: 'stepId is required' }, { status: 400 })
    }
    if (!mode || typeof mode !== 'string') {
      return NextResponse.json({ error: 'mode is required' }, { status: 400 })
    }
    if (!mimeType || typeof mimeType !== 'string') {
      return NextResponse.json({ error: 'mimeType is required' }, { status: 400 })
    }

    // Workspace-level opt-in check. Loads only the workspace settings JSON
    // via the session so we keep the query lean. createCaptureForUpload below
    // does its own session-not-found / step-validation work, so a missing
    // session here just falls through to that handler — no need to special
    // case it twice.
    const sessionRow = await prisma.session.findUnique({
      where: { id: params.sessionId },
      select: { workspaceId: true, workspace: { select: { settings: true } } },
    })
    if (sessionRow) {
      if (!isCaptureStepsEnabledForWorkspace({ workspaceSettings: sessionRow.workspace.settings })) {
        captureLog('capture_upload_failed', {
          sessionId: params.sessionId,
          workspaceId: sessionRow.workspaceId,
          reason: 'workspace_not_enabled',
        })
        // Same 503 + feature_disabled code as the global flag — the candidate
        // experience is identical regardless of which gate is off.
        return NextResponse.json(
          { error: 'Capture uploads are temporarily disabled.', code: 'feature_disabled' },
          { status: 503 }
        )
      }
    }

    const { capture, storageKey } = await createCaptureForUpload({
      sessionId: params.sessionId,
      stepId,
      mode: mode as CaptureMode,
      mimeType,
    })

    const { url, expiresAt } = await presignCaptureUpload({
      key: storageKey,
      mimeType,
    })

    captureLog('capture_upload_started', {
      sessionId: params.sessionId,
      stepId,
      captureId: capture.id,
      workspaceId: capture.workspaceId,
      mode,
      mimeType,
    })

    return NextResponse.json({
      captureId: capture.id,
      uploadUrl: url,
      storageKey,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (err) {
    if (err instanceof CaptureError) {
      captureLog('capture_upload_failed', {
        sessionId: params.sessionId,
        reason: err.message,
        errorCode: err.code,
        statusCode: err.status,
      })
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('[captures/presign] unexpected error', err)
    captureLog('capture_upload_failed', {
      sessionId: params.sessionId,
      reason: (err as any)?.message || 'unknown',
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
