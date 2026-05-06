/**
 * GET    /api/candidates/[id]/background-check  — list + status for this session
 * POST   /api/candidates/[id]/background-check  — order a check (idempotent)
 * DELETE /api/candidates/[id]/background-check  — cancel the active check
 *
 * `id` is a Session id (HiringFlow's candidate identity).
 *
 * Workspace isolation: the session must belong to the caller's workspace; the
 * Certn case lives under the workspace's CertnIntegration. Same workspace id
 * is enforced on every read.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { orderForSession } from '@/lib/certn/order'
import { CertnConfigError, CertnError, cancelCase, generateReport, getReportFile, resolveClient } from '@/lib/certn/client'
import { syncBackgroundCheck } from '@/lib/certn/sync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteContext { params: Promise<{ id: string }> }

async function loadSession(sessionId: string, workspaceId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, workspaceId: true, candidateEmail: true, candidateName: true },
  })
  if (!session || session.workspaceId !== workspaceId) return null
  return session
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await getWorkspaceSession()
  if (!auth) return unauthorized()
  const { id } = await context.params

  const session = await loadSession(id, auth.workspaceId)
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const checks = await prisma.backgroundCheck.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      certnCaseId: true,
      status: true,
      overallScore: true,
      inviteLink: true,
      createdAt: true,
      lastSyncedAt: true,
      completedAt: true,
    },
  })

  return NextResponse.json({ checks })
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await getWorkspaceSession()
  if (!auth) return unauthorized()
  const { id } = await context.params

  const session = await loadSession(id, auth.workspaceId)
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  try {
    const result = await orderForSession({
      sessionId: id,
      orderedById: auth.userId,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof CertnConfigError) {
      return NextResponse.json({ error: 'config_error', message: err.message }, { status: 400 })
    }
    if (err instanceof CertnError) {
      return NextResponse.json({ error: 'certn_error', message: err.message, status: err.status, body: err.body }, { status: 502 })
    }
    console.error('[background-check] order failed', err)
    return NextResponse.json({ error: 'unexpected', message: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await getWorkspaceSession()
  if (!auth) return unauthorized()
  const { id } = await context.params

  const session = await loadSession(id, auth.workspaceId)
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const active = await prisma.backgroundCheck.findFirst({
    where: { sessionId: id },
    orderBy: { createdAt: 'desc' },
  })
  if (!active) return NextResponse.json({ error: 'no_active_check' }, { status: 404 })

  try {
    const client = await resolveClient(auth.workspaceId)
    await cancelCase(client, active.certnCaseId)
  } catch (err) {
    // Continue with the local update even if remote cancel fails — the
    // recruiter explicitly asked to stop tracking this on our side.
    console.error('[background-check] remote cancel failed (continuing locally):', err)
  }

  await prisma.backgroundCheck.update({
    where: { id: active.id },
    data: { status: 'CANCELLED' },
  })
  return NextResponse.json({ ok: true })
}

// ─── PATCH /api/candidates/[id]/background-check?action=sync|report ────────
//
// Two on-demand actions:
//  - action=sync   → force-fetch from Certn and reconcile (used by the
//                    "Refresh status" button when the recruiter doesn't want
//                    to wait for the next webhook / cron).
//  - action=report → generate-report-and-fetch-presigned-url for the
//                    "Download report" button. Returns { url } that the
//                    client opens in a new tab. CASE_REPORT_READY may not
//                    fire instantly — we attempt one fetch immediately and
//                    surface the in-progress state if the URL isn't ready.

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await getWorkspaceSession()
  if (!auth) return unauthorized()
  const { id } = await context.params
  const action = request.nextUrl.searchParams.get('action')

  const session = await loadSession(id, auth.workspaceId)
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const active = await prisma.backgroundCheck.findFirst({
    where: { sessionId: id },
    orderBy: { createdAt: 'desc' },
  })
  if (!active) return NextResponse.json({ error: 'no_active_check' }, { status: 404 })

  if (action === 'sync') {
    try {
      const result = await syncBackgroundCheck(active.id)
      return NextResponse.json({ ok: true, ...result })
    } catch (err) {
      console.error('[background-check] sync failed', err)
      return NextResponse.json({ error: 'sync_failed', message: (err as Error).message }, { status: 500 })
    }
  }

  if (action === 'report') {
    try {
      const client = await resolveClient(auth.workspaceId)
      const generated = await generateReport(client, active.certnCaseId)
      // Try to fetch the presigned URL right away. Often returns a "still
      // generating" status — the UI handles that by re-polling.
      let url: string | null = null
      try {
        const file = await getReportFile(client, generated.id)
        url = file.url ?? null
      } catch (err) {
        if (!(err instanceof CertnError) || err.status !== 404) throw err
      }
      return NextResponse.json({ ok: true, reportFileId: generated.id, url })
    } catch (err) {
      if (err instanceof CertnConfigError) {
        return NextResponse.json({ error: 'config_error', message: err.message }, { status: 400 })
      }
      console.error('[background-check] generate-report failed', err)
      return NextResponse.json({ error: 'report_failed', message: (err as Error).message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
}
