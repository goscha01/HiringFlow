import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { listSessionCaptures } from '@/lib/capture/capture-response.service'
import { checkCaptureRateLimit, extractIp } from '@/lib/capture/capture-rate-limit'

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

  return NextResponse.json({
    captures: rows.map((r) => ({
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
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  })
}
