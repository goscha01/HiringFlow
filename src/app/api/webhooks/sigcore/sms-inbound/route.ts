/**
 * POST /api/webhooks/sigcore/sms-inbound
 *
 * Inbound SMS callback from Sigcore. Lets a candidate confirm or cancel an
 * upcoming interview by replying to the before-meeting reminder.
 *
 *   YES / Y / CONFIRM     → mark InterviewMeeting.confirmedAt; send "got it" ack
 *   NO / N / CANCEL / STOP → delete the Google Calendar event, log
 *                           meeting_cancelled, stamp Session.rejectionReason
 *                           = 'Canceled', route candidate to Rejected stage,
 *                           cancel any queued before_meeting reminders, send
 *                           "your interview has been cancelled" ack
 *   anything else          → no-op (200 ack so Sigcore doesn't retry)
 *
 * Auth: shared secret in `X-Sigcore-Webhook-Key` header. Configure this on
 * the Sigcore tenant webhook subscription so only Sigcore can post here.
 *
 * Payload contract (HF-side; Sigcore should adapt its outbound subscription
 * to this shape):
 *   {
 *     "from": "+15551234567",     // candidate's phone (E.164 preferred; we normalize)
 *     "to":   "+19183091938",     // HF profile number (informational only)
 *     "body": "yes",
 *     "messageId": "SM..."        // optional Sigcore/Twilio id, used for idempotency log only
 *   }
 *
 * Session matching is by phone number across all workspaces. If a phone matches
 * multiple workspaces (rare — same candidate applied to two HF customers using
 * the same phone), we pick the session with the soonest upcoming
 * InterviewMeeting. Worst case the candidate confirms/cancels the wrong one;
 * the recruiter on the affected workspace can revert manually.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logSchedulingEvent } from '@/lib/scheduling'
import { applyStageTrigger } from '@/lib/funnel-stage-runtime'
import { cancelBeforeMeetingReminders } from '@/lib/automation'
import { deleteCalendarEvent } from '@/lib/google'
import { sendSms, normalizeToE164 } from '@/lib/sms'

type Intent = 'confirm' | 'cancel' | 'unknown'

const CONFIRM_KEYWORDS = new Set(['yes', 'y', 'confirm', 'confirmed', 'ok', 'okay'])
const CANCEL_KEYWORDS = new Set(['no', 'n', 'cancel', 'cancelled', 'canceled', 'stop', 'unsubscribe'])

function classifyIntent(body: string): Intent {
  const first = body.trim().toLowerCase().split(/\s+/)[0] || ''
  // Strip trailing punctuation ("yes!", "no.", etc.)
  const word = first.replace(/[^a-z]/g, '')
  if (CONFIRM_KEYWORDS.has(word)) return 'confirm'
  if (CANCEL_KEYWORDS.has(word)) return 'cancel'
  return 'unknown'
}

interface InboundPayload {
  from?: string
  to?: string
  body?: string
  messageId?: string
}

export async function POST(req: Request) {
  const expected = process.env.SIGCORE_WEBHOOK_KEY?.trim()
  if (!expected) {
    console.error('[sms-inbound] SIGCORE_WEBHOOK_KEY not configured — refusing all webhooks')
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })
  }
  const provided = req.headers.get('x-sigcore-webhook-key')?.trim()
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: InboundPayload
  try {
    payload = (await req.json()) as InboundPayload
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const fromRaw = typeof payload.from === 'string' ? payload.from : ''
  const body = typeof payload.body === 'string' ? payload.body : ''
  const from = normalizeToE164(fromRaw)
  if (!from) {
    console.warn('[sms-inbound] missing/invalid from phone:', fromRaw)
    // 200 so Sigcore doesn't retry; nothing actionable.
    return NextResponse.json({ ok: true, ignored: 'invalid_from' })
  }
  if (!body.trim()) {
    return NextResponse.json({ ok: true, ignored: 'empty_body' })
  }

  const intent = classifyIntent(body)
  if (intent === 'unknown') {
    console.log(`[sms-inbound] unrecognized reply from ${from}: "${body.slice(0, 60)}"`)
    return NextResponse.json({ ok: true, ignored: 'unrecognized_keyword' })
  }

  // Find the candidate's most relevant InterviewMeeting. Prefer an upcoming
  // meeting (scheduledStart > now); fall back to one that started within the
  // last hour (a "yes, on my way" reply right at start-time is still useful).
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const candidates = await prisma.session.findMany({
    where: { candidatePhone: { not: null } },
    select: {
      id: true,
      workspaceId: true,
      candidatePhone: true,
      interviewMeetings: {
        where: { scheduledStart: { gte: oneHourAgo } },
        orderBy: { scheduledStart: 'asc' },
        select: {
          id: true, googleCalendarEventId: true, scheduledStart: true,
          confirmedAt: true,
        },
      },
    },
  })

  // Filter to sessions whose normalized phone matches and that have at least
  // one in-window meeting. Pick the session with the SOONEST upcoming meeting
  // — that's the one the candidate is most likely replying about.
  type Match = {
    sessionId: string
    workspaceId: string
    meeting: {
      id: string
      googleCalendarEventId: string
      scheduledStart: Date
      confirmedAt: Date | null
    }
  }
  const matches: Match[] = []
  for (const c of candidates) {
    const normalized = c.candidatePhone ? normalizeToE164(c.candidatePhone) : null
    if (normalized !== from) continue
    const meeting = c.interviewMeetings[0]
    if (!meeting) continue
    matches.push({ sessionId: c.id, workspaceId: c.workspaceId, meeting })
  }
  if (matches.length === 0) {
    console.log(`[sms-inbound] no upcoming/recent meeting for ${from} (intent=${intent})`)
    return NextResponse.json({ ok: true, ignored: 'no_active_meeting' })
  }
  matches.sort((a, b) => a.meeting.scheduledStart.getTime() - b.meeting.scheduledStart.getTime())
  const target = matches[0]

  if (intent === 'confirm') {
    return await handleConfirm(target, from)
  }
  return await handleCancel(target, from)
}

async function handleConfirm(target: {
  sessionId: string
  workspaceId: string
  meeting: { id: string; confirmedAt: Date | null }
}, from: string) {
  // Idempotent: if already confirmed, just re-ack.
  if (!target.meeting.confirmedAt) {
    await prisma.interviewMeeting.update({
      where: { id: target.meeting.id },
      data: { confirmedAt: new Date() },
    })
    await logSchedulingEvent({
      sessionId: target.sessionId,
      eventType: 'meeting_confirmed',
      metadata: {
        interviewMeetingId: target.meeting.id,
        source: 'candidate_sms',
      },
    }).catch((err) => console.error('[sms-inbound] log meeting_confirmed failed:', err))

    // Optional stage move — only if the workspace wired meeting_confirmed
    // to a custom stage. No legacy fallback (we don't want to bump a
    // confirmed candidate forward by default).
    await applyStageTrigger({
      sessionId: target.sessionId,
      workspaceId: target.workspaceId,
      event: 'meeting_confirmed',
    }).catch((err) => console.error('[sms-inbound] applyStageTrigger(confirmed) failed:', err))
  }

  await sendAck(target.sessionId, target.workspaceId, from, 'Thanks — your interview is confirmed. See you then!')
    .catch((err) => console.error('[sms-inbound] confirm ack failed:', err))

  return NextResponse.json({ ok: true, action: 'confirmed', meetingId: target.meeting.id })
}

async function handleCancel(target: {
  sessionId: string
  workspaceId: string
  meeting: { id: string; googleCalendarEventId: string }
}, from: string) {
  // Delete the Google Calendar event so the recruiter's calendar reflects
  // the cancellation. Best-effort — failures here don't block the rest of
  // the cancel flow because the HF-side state is what drives the kanban.
  let calendarDeleted = false
  let calendarError: string | null = null
  try {
    const res = await deleteCalendarEvent(target.workspaceId, target.meeting.googleCalendarEventId)
    calendarDeleted = res.deleted || !!res.alreadyGone
  } catch (err) {
    calendarError = (err as Error).message
    console.error('[sms-inbound] deleteCalendarEvent failed:', calendarError)
  }

  // Log the cancellation in the audit timeline. Idempotency: if a
  // meeting_cancelled event already exists for this meeting (e.g. the
  // calendar watch already saw the deletion before this handler ran), skip
  // the duplicate insert.
  const existing = await prisma.schedulingEvent.findFirst({
    where: {
      sessionId: target.sessionId,
      eventType: 'meeting_cancelled',
      metadata: { path: ['interviewMeetingId'], equals: target.meeting.id },
    },
    select: { id: true },
  })
  if (!existing) {
    await logSchedulingEvent({
      sessionId: target.sessionId,
      eventType: 'meeting_cancelled',
      metadata: {
        interviewMeetingId: target.meeting.id,
        source: 'candidate_sms',
        calendarDeleted,
        calendarError,
      },
    }).catch((err) => console.error('[sms-inbound] log meeting_cancelled failed:', err))
  }

  // Cancel any queued before_meeting reminders so the candidate doesn't
  // get a "your interview is in 1h" SMS after they cancelled.
  await cancelBeforeMeetingReminders(target.sessionId).catch((err) =>
    console.error('[sms-inbound] cancelBeforeMeetingReminders failed:', err))

  // Stamp rejection reason. Always overwrite — the candidate's most recent
  // signal wins, mirroring the no-show auto-stamp behaviour.
  await prisma.session.update({
    where: { id: target.sessionId },
    data: {
      rejectionReason: 'Canceled',
      rejectionReasonAt: new Date(),
    },
  }).catch((err) => console.error('[sms-inbound] stamp rejectionReason failed:', err))

  // Move to Rejected. Like meeting_no_show, this falls back to the legacy
  // 'rejected' status so unconfigured workspaces still land the candidate
  // in the default Rejected column.
  await applyStageTrigger({
    sessionId: target.sessionId,
    workspaceId: target.workspaceId,
    event: 'meeting_cancelled',
    legacyStatus: 'rejected',
  }).catch((err) => console.error('[sms-inbound] applyStageTrigger(cancelled) failed:', err))

  await sendAck(target.sessionId, target.workspaceId, from, 'Got it — your interview has been cancelled. Reach out if you change your mind.')
    .catch((err) => console.error('[sms-inbound] cancel ack failed:', err))

  return NextResponse.json({
    ok: true,
    action: 'cancelled',
    meetingId: target.meeting.id,
    calendarDeleted,
  })
}

async function sendAck(sessionId: string, workspaceId: string, to: string, body: string): Promise<void> {
  await sendSms({ candidateId: sessionId, workspaceId, to, body })
}
