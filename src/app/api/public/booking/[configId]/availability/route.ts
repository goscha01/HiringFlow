/**
 * GET /api/public/booking/[configId]/availability
 *
 * Public — auth via signed `t` token (purpose='book'). Returns slot
 * candidates in UTC plus the rules summary needed to render the picker.
 *
 * Query params:
 *   t       — signed booking token (required)
 *   from    — ISO timestamp (optional; defaults to nowUtc)
 *   to      — ISO timestamp (optional; defaults to from + maxDaysOut)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyBookingToken } from '@/lib/scheduling/booking-links'
import { parseBookingRulesOrDefault } from '@/lib/scheduling/booking-rules'
import { getBusyIntervals } from '@/lib/scheduling/free-busy'
import { computeAvailableSlots } from '@/lib/scheduling/slot-computer'

// Per-token rate limiter (in-memory). 30 req/min/token. Resets every 60s
// rolling — good enough for a public picker page that fires ~3 requests
// per candidate visit (initial + tz change + week scroll).
const rateBuckets = new Map<string, { count: number; resetAt: number }>()
function rateLimitOk(token: string): boolean {
  const now = Date.now()
  const cur = rateBuckets.get(token)
  if (!cur || now >= cur.resetAt) {
    rateBuckets.set(token, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (cur.count >= 30) return false
  cur.count++
  return true
}

export async function GET(request: NextRequest, { params }: { params: { configId: string } }) {
  const url = new URL(request.url)
  const t = url.searchParams.get('t')

  const verified = verifyBookingToken(t)
  if (!verified.ok) {
    return NextResponse.json({ error: 'invalid_token', reason: verified.reason }, { status: 401 })
  }
  if (verified.payload.purpose !== 'book') {
    return NextResponse.json({ error: 'wrong_purpose' }, { status: 401 })
  }
  if (verified.payload.configId !== params.configId) {
    return NextResponse.json({ error: 'config_mismatch' }, { status: 401 })
  }

  if (!rateLimitOk(t!)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const config = await prisma.schedulingConfig.findUnique({
    where: { id: params.configId },
    select: {
      id: true,
      isActive: true,
      useBuiltInScheduler: true,
      bookingRules: true,
      calendarId: true,
      workspaceId: true,
      workspace: { select: { timezone: true, name: true } },
    },
  })
  if (!config || !config.isActive) {
    return NextResponse.json({ error: 'config_not_found' }, { status: 404 })
  }
  if (!config.useBuiltInScheduler) {
    return NextResponse.json({ error: 'built_in_disabled' }, { status: 409 })
  }

  const rules = parseBookingRulesOrDefault(config.bookingRules)
  const recruiterTimezone = config.workspace.timezone

  const nowUtc = new Date()
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')
  const fromUtc = fromParam ? new Date(fromParam) : nowUtc
  const toUtc = toParam
    ? new Date(toParam)
    : new Date(nowUtc.getTime() + rules.maxDaysOut * 24 * 60 * 60 * 1000)

  if (isNaN(fromUtc.getTime()) || isNaN(toUtc.getTime()) || toUtc <= fromUtc) {
    return NextResponse.json({ error: 'invalid_window' }, { status: 400 })
  }

  let busy
  try {
    busy = await getBusyIntervals({
      workspaceId: config.workspaceId,
      calendarId: config.calendarId || undefined,
      fromUtc,
      toUtc,
    })
  } catch (err) {
    console.error('[availability] freeBusy failed:', err)
    return NextResponse.json({ error: 'free_busy_failed', message: (err as Error).message }, { status: 502 })
  }

  const slots = computeAvailableSlots({
    rules,
    recruiterTimezone,
    busyIntervals: busy,
    fromUtc,
    toUtc,
    nowUtc,
  })

  return NextResponse.json({
    slots: slots.map((s) => ({ startUtc: s.startUtc.toISOString(), endUtc: s.endUtc.toISOString() })),
    rules: {
      durationMinutes: rules.durationMinutes,
      slotIntervalMinutes: rules.slotIntervalMinutes,
      minNoticeHours: rules.minNoticeHours,
      maxDaysOut: rules.maxDaysOut,
    },
    recruiterTimezone,
    workspaceName: config.workspace.name,
  })
}
