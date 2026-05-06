/**
 * GET/POST /api/webhooks/certn/[workspaceId]
 *
 * Per-workspace webhook endpoint for CertnCentric.
 *
 * GET — endpoint verification challenge.
 *   Certn fires `GET ?challenge=abc123` when the URL is registered (and
 *   periodically thereafter). We MUST echo `abc123` as text/plain within
 *   10 seconds or Certn auto-disables the webhook. No DB / no auth — the
 *   only requirement is to be fast and return the verbatim challenge.
 *
 * POST — event delivery.
 *   Body shape:
 *     { created, event_id, event_type, object_id, object_type: "CASE" }
 *   Headers: `X-Signature: <hex>` = HMAC-SHA256(workspaceWebhookSecret, rawBody).
 *
 *   Flow:
 *     1. Read raw body (must NOT use req.json() — it consumes the stream
 *        and we lose the bytes needed for HMAC).
 *     2. Look up the workspace's webhookSecret. Verify signature with
 *        timingSafeEqual. Reject 401/403 on mismatch.
 *     3. Dedupe via ProcessedCertnEvent (workspaceId, certnEventId) unique.
 *        Already-processed → return 200 immediately.
 *     4. For CASE_STATUS_CHANGED / CHECK_STATUS_CHANGED:
 *        run syncBackgroundCheck which fetches the case + reconciles state.
 *     5. CASE_REPORT_READY / CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED are
 *        recorded (for audit) but no automatic action.
 *     6. Always 200 fast — Certn requires <10s response.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { syncBackgroundCheck } from '@/lib/certn/sync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ workspaceId: string }>
}

// ─── GET: endpoint verification ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get('challenge')
  // Certn requires the body to be the raw challenge value as text/plain.
  // X-Content-Type-Options is recommended in their example to suppress
  // browser MIME sniffing.
  return new NextResponse(challenge ?? '', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// ─── POST: event delivery ───────────────────────────────────────────────────

interface CertnWebhookEvent {
  created?: string
  event_id?: string
  event_type?: string
  object_id?: string
  object_type?: string
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspace_id_missing' }, { status: 400 })
  }

  // 1. Raw body — must read as text BEFORE parsing so HMAC matches the bytes
  //    Certn signed (body parsers can normalize whitespace and break sigs).
  const rawBody = await request.text()

  // 2. Signature verification.
  const integration = await prisma.certnIntegration.findUnique({
    where: { workspaceId },
    select: { id: true, isActive: true, webhookSecret: true },
  })
  if (!integration) {
    return NextResponse.json({ error: 'integration_not_found' }, { status: 404 })
  }
  if (!integration.isActive) {
    // Acknowledge so Certn stops retrying, but log for visibility.
    console.warn(`[Certn webhook] Workspace ${workspaceId} integration is disabled — dropping event`)
    return NextResponse.json({ ok: true, skipped: 'integration_disabled' })
  }

  const signatureHeader = request.headers.get('x-signature') || request.headers.get('X-Signature')

  if (integration.webhookSecret) {
    if (!signatureHeader) {
      return NextResponse.json({ error: 'signature_missing' }, { status: 401 })
    }
    let secret: string
    try {
      secret = decrypt(integration.webhookSecret)
    } catch {
      console.error(`[Certn webhook] Failed to decrypt webhook secret for workspace ${workspaceId}`)
      return NextResponse.json({ error: 'config_error' }, { status: 500 })
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    let ok = false
    try {
      const a = Buffer.from(signatureHeader, 'hex')
      const b = Buffer.from(expected, 'hex')
      ok = a.length === b.length && timingSafeEqual(a, b)
    } catch {
      ok = false
    }
    if (!ok) {
      console.warn(`[Certn webhook] Bad signature for workspace ${workspaceId}`)
      return NextResponse.json({ error: 'signature_invalid' }, { status: 403 })
    }
  } else {
    // No secret configured. Accept the event but log loudly — this is the
    // initial-setup state; once the recruiter pastes the secret, signature
    // verification kicks in.
    console.warn(`[Certn webhook] No signing secret configured for workspace ${workspaceId} — accepting unverified payload`)
  }

  // 3. Parse + dedupe.
  let event: CertnWebhookEvent
  try {
    event = JSON.parse(rawBody) as CertnWebhookEvent
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!event.event_id || !event.event_type || !event.object_id) {
    return NextResponse.json({ error: 'event_fields_missing' }, { status: 400 })
  }

  const isDuplicate = await prisma.processedCertnEvent
    .create({
      data: {
        workspaceId,
        certnEventId: event.event_id,
        eventType: event.event_type,
        caseId: event.object_id,
      },
    })
    .then(() => false)
    .catch(() => true) // unique violation = already processed

  if (isDuplicate) {
    return NextResponse.json({ ok: true, deduped: true })
  }

  // 4. Locate the BackgroundCheck row and reconcile.
  if (event.object_type !== 'CASE' && event.object_type !== undefined) {
    return NextResponse.json({ ok: true, skipped: `object_type=${event.object_type}` })
  }

  const bc = await prisma.backgroundCheck.findUnique({
    where: { certnCaseId: event.object_id },
    select: { id: true, workspaceId: true },
  })
  if (!bc) {
    // Webhook for a case we don't have locally — could be a manual case in
    // the Certn portal or a stale subscription. Log and ack.
    console.warn(`[Certn webhook] No local BackgroundCheck for case ${event.object_id} (workspace ${workspaceId})`)
    return NextResponse.json({ ok: true, skipped: 'unknown_case' })
  }
  if (bc.workspaceId !== workspaceId) {
    // Defense-in-depth: case belongs to a different workspace. Don't sync.
    console.error(`[Certn webhook] Case ${event.object_id} belongs to workspace ${bc.workspaceId}, not ${workspaceId}`)
    return NextResponse.json({ error: 'workspace_mismatch' }, { status: 403 })
  }

  // CASE_REPORT_READY and CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED don't
  // change the state we care about — the report is downloaded on-demand
  // and the input claims are visible in Certn's portal. We've already
  // recorded the event in ProcessedCertnEvent for audit; no further work.
  if (
    event.event_type === 'CASE_REPORT_READY' ||
    event.event_type === 'CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED'
  ) {
    return NextResponse.json({ ok: true, recorded_only: true })
  }

  // CASE_STATUS_CHANGED, CHECK_STATUS_CHANGED → resync the case.
  // syncBackgroundCheck fires automation triggers when the case crosses into
  // a terminal+scored state; subsequent webhooks for the same case re-run
  // the fetch but the trigger only fires once.
  try {
    const result = await syncBackgroundCheck(bc.id, { eventId: event.event_id })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[Certn webhook] sync failed', err)
    // Return 500 so Certn retries with backoff (up to ~2h).
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 })
  }
}
