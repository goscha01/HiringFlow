/**
 * GET /api/cron/certn-reconcile
 *
 * Backup poll for Certn background checks. The primary path is webhooks
 * (CASE_STATUS_CHANGED), but webhooks can be silently disabled by Certn if
 * endpoint verification ever fails — same failure mode we hit with Google
 * Workspace Events subscriptions. With check completion taking 1–2 days,
 * a missed webhook would leave a candidate sitting silently forever.
 *
 * This cron walks every BackgroundCheck row whose status is non-terminal
 * AND whose lastSyncedAt is older than RECONCILE_THRESHOLD_HOURS, and
 * resyncs each one. syncBackgroundCheck is idempotent — if the case is
 * still in progress, the row's lastSyncedAt bumps and that's it. If it
 * crossed into a terminal+scored state, the appropriate automation
 * trigger fires.
 *
 * Rate-limit budget: Certn allows 60 req/min, 7220 req/day per account.
 * We cap MAX_RECONCILE_PER_RUN to stay safely under that even if many
 * checks need polling at once.
 *
 * Vercel cron schedule: every 30 min.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncBackgroundCheck } from '@/lib/certn/sync'
import { TERMINAL_CASE_STATUSES } from '@/lib/certn/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RECONCILE_THRESHOLD_HOURS = 6
const MAX_RECONCILE_PER_RUN = 100

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - RECONCILE_THRESHOLD_HOURS * 60 * 60 * 1000)
  const candidates = await prisma.backgroundCheck.findMany({
    where: {
      status: { notIn: Array.from(TERMINAL_CASE_STATUSES) },
      OR: [
        { lastSyncedAt: null },
        { lastSyncedAt: { lt: cutoff } },
      ],
      integration: { isActive: true },
    },
    orderBy: { lastSyncedAt: 'asc' },
    take: MAX_RECONCILE_PER_RUN,
    select: { id: true },
  })

  let synced = 0
  let outcomeFired = 0
  let failed = 0
  const errors: Array<{ id: string; error: string }> = []

  for (const c of candidates) {
    try {
      const result = await syncBackgroundCheck(c.id)
      synced++
      if (result.outcomeFired) outcomeFired++
    } catch (err) {
      failed++
      errors.push({ id: c.id, error: (err as Error).message })
      console.error(`[Certn cron] sync failed for ${c.id}:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    examined: candidates.length,
    synced,
    outcomeFired,
    failed,
    errors: errors.slice(0, 10), // truncate noisy responses
  })
}
