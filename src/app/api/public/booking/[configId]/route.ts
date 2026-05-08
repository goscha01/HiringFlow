/**
 * POST /api/public/booking/[configId]
 *
 * Public — auth via signed `t` token (purpose='book'). Books the slot the
 * candidate selected. Re-checks availability under the same FreeBusy lookup
 * the picker used so race-conditions are caught at submit time, not after
 * a Meet event has been created.
 *
 * Idempotency: if the session has a meeting_scheduled SchedulingEvent
 * created within the last 5 minutes from this scheduler, we treat the
 * incoming POST as a duplicate (browser double-submit, retry, etc.) and
 * return the existing meeting rather than booking a second one.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyBookingToken, issueBookingToken } from '@/lib/scheduling/booking-links'
import { parseBookingRulesOrDefault } from '@/lib/scheduling/booking-rules'
import { getBusyIntervals } from '@/lib/scheduling/free-busy'
import { computeAvailableSlots } from '@/lib/scheduling/slot-computer'
import { bookInterview, BookInterviewError } from '@/lib/scheduling/book-interview'

export async function POST(request: NextRequest, { params }: { params: { configId: string } }) {
  const body = await request.json().catch(() => ({})) as {
    t?: string
    slotStartUtc?: string
    candidateName?: string | null
    candidateEmail?: string | null
    candidatePhone?: string | null
    notes?: string | null
  }

  const verified = verifyBookingToken(body.t)
  if (!verified.ok) {
    return NextResponse.json({ error: 'invalid_token', reason: verified.reason }, { status: 401 })
  }
  if (verified.payload.purpose !== 'book') {
    return NextResponse.json({ error: 'wrong_purpose' }, { status: 401 })
  }
  if (verified.payload.configId !== params.configId) {
    return NextResponse.json({ error: 'config_mismatch' }, { status: 401 })
  }
  if (!body.slotStartUtc) {
    return NextResponse.json({ error: 'slotStartUtc required' }, { status: 400 })
  }
  const slotStart = new Date(body.slotStartUtc)
  if (isNaN(slotStart.getTime())) {
    return NextResponse.json({ error: 'invalid_slot' }, { status: 400 })
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
      workspace: { select: { timezone: true } },
    },
  })
  if (!config || !config.isActive || !config.useBuiltInScheduler) {
    return NextResponse.json({ error: 'config_not_found' }, { status: 404 })
  }

  // Idempotency: returning duplicate within 5 min as success.
  const recent = await prisma.schedulingEvent.findFirst({
    where: {
      sessionId: verified.payload.sessionId,
      eventType: 'meeting_scheduled',
      createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
    },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  })
  if (recent && recent.metadata && typeof recent.metadata === 'object' && 'source' in recent.metadata) {
    const md = recent.metadata as { source?: string; meetingUrl?: string; interviewMeetingId?: string }
    if (md.source === 'built_in_scheduler') {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        meetingUri: md.meetingUrl || null,
        interviewMeetingId: md.interviewMeetingId || null,
      })
    }
  }

  // Re-validate slot is still free with a fresh FreeBusy fetch.
  const rules = parseBookingRulesOrDefault(config.bookingRules)
  const slotEnd = new Date(slotStart.getTime() + rules.durationMinutes * 60_000)
  const fromUtc = new Date(slotStart.getTime() - 60_000)
  const toUtc = new Date(slotEnd.getTime() + 60_000)

  let busy
  try {
    busy = await getBusyIntervals({
      workspaceId: config.workspaceId,
      calendarId: config.calendarId || undefined,
      fromUtc,
      toUtc,
      bustCache: true,
    })
  } catch (err) {
    console.error('[booking] freeBusy failed:', err)
    return NextResponse.json({ error: 'free_busy_failed', message: (err as Error).message }, { status: 502 })
  }

  const stillAvailable = computeAvailableSlots({
    rules,
    recruiterTimezone: config.workspace.timezone,
    busyIntervals: busy,
    fromUtc,
    toUtc,
    nowUtc: new Date(),
  }).some((s) => s.startUtc.getTime() === slotStart.getTime())

  if (!stillAvailable) {
    return NextResponse.json({ error: 'slot_unavailable' }, { status: 409 })
  }

  // Update session contact info if the candidate filled in fresh details.
  const updates: Record<string, string> = {}
  if (body.candidateName && body.candidateName.trim()) updates.candidateName = body.candidateName.trim()
  if (body.candidateEmail && body.candidateEmail.trim()) updates.candidateEmail = body.candidateEmail.trim()
  if (body.candidatePhone && body.candidatePhone.trim()) updates.candidatePhone = body.candidatePhone.trim()
  if (Object.keys(updates).length > 0) {
    await prisma.session.update({
      where: { id: verified.payload.sessionId },
      data: updates,
    }).catch((err) => console.error('[booking] session update failed:', err))
  }

  try {
    const result = await bookInterview({
      workspaceId: config.workspaceId,
      sessionId: verified.payload.sessionId,
      scheduledAt: slotStart,
      durationMinutes: rules.durationMinutes,
      record: false,
      notes: body.notes,
      attendeeEmail: body.candidateEmail,
      schedulingConfigId: config.id,
      source: 'public',
      loggedBy: null,
    })

    // Issue reschedule + cancel tokens, expiring at slotStart - 1h (no
    // changes after the meeting starts).
    const cutoff = new Date(slotStart.getTime() - 60 * 60_000)
    const rescheduleToken = issueBookingToken({
      sessionId: verified.payload.sessionId, configId: params.configId, purpose: 'reschedule', expiresAt: cutoff,
    })
    const cancelToken = issueBookingToken({
      sessionId: verified.payload.sessionId, configId: params.configId, purpose: 'cancel', expiresAt: cutoff,
    })

    return NextResponse.json({
      ok: true,
      meetingUri: result.interviewMeeting.meetingUri,
      scheduledStart: result.interviewMeeting.scheduledStart,
      scheduledEnd: result.interviewMeeting.scheduledEnd,
      interviewMeetingId: result.interviewMeeting.id,
      rescheduleToken,
      cancelToken,
      warnings: result.warnings,
    })
  } catch (err) {
    if (err instanceof BookInterviewError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    console.error('[booking] unexpected error:', err)
    return NextResponse.json({ error: 'internal', message: (err as Error).message }, { status: 500 })
  }
}
