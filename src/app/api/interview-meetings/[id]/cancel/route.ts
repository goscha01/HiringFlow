/**
 * POST /api/interview-meetings/[id]/cancel
 *
 * Recruiter-initiated cancel from the candidate detail page. Mirrors the
 * candidate-side SMS cancel path in `webhooks/sigcore/sms-inbound`:
 *   - Delete the Google Calendar event (so it disappears from both sides).
 *   - Log a `meeting_cancelled` SchedulingEvent (idempotent — skipped when
 *     one already exists for this meeting).
 *   - Cancel queued before_meeting reminders + meeting-dependent follow-ups.
 *   - Stamp `Session.rejectionReason='Canceled'` + `rejectionReasonAt=now`.
 *   - applyStageTrigger('meeting_cancelled', legacyStatus='rejected') so
 *     unconfigured workspaces still land in the default Rejected column.
 *
 * Returns `{ ok, calendarDeleted, alreadyCancelled }` so the UI can toast
 * accordingly.
 */

import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSchedulingEvent } from '@/lib/scheduling'
import { applyStageTrigger } from '@/lib/funnel-stage-runtime'
import { cancelBeforeMeetingReminders, cancelMeetingDependentFollowups } from '@/lib/automation'
import { deleteCalendarEvent } from '@/lib/google'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const meeting = await prisma.interviewMeeting.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: { id: true, sessionId: true, googleCalendarEventId: true },
  })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existingCancel = await prisma.schedulingEvent.findFirst({
    where: {
      sessionId: meeting.sessionId,
      eventType: 'meeting_cancelled',
      metadata: { path: ['interviewMeetingId'], equals: meeting.id },
    },
    select: { id: true },
  })
  if (existingCancel) {
    return NextResponse.json({ ok: true, alreadyCancelled: true, calendarDeleted: false })
  }

  let calendarDeleted = false
  let calendarError: string | null = null
  try {
    const res = await deleteCalendarEvent(ws.workspaceId, meeting.googleCalendarEventId)
    calendarDeleted = res.deleted || !!res.alreadyGone
  } catch (err) {
    calendarError = (err as Error).message
    console.error('[interview-meetings.cancel] deleteCalendarEvent failed:', calendarError)
  }

  await logSchedulingEvent({
    sessionId: meeting.sessionId,
    eventType: 'meeting_cancelled',
    metadata: {
      interviewMeetingId: meeting.id,
      source: 'recruiter_manual',
      cancelledBy: ws.userId,
      calendarDeleted,
      calendarError,
    },
  }).catch((err) => console.error('[interview-meetings.cancel] logSchedulingEvent failed:', err))

  await cancelBeforeMeetingReminders(meeting.sessionId).catch((err) =>
    console.error('[interview-meetings.cancel] cancelBeforeMeetingReminders failed:', err))
  await cancelMeetingDependentFollowups(meeting.sessionId).catch((err) =>
    console.error('[interview-meetings.cancel] cancelMeetingDependentFollowups failed:', err))

  await prisma.session.update({
    where: { id: meeting.sessionId },
    data: { rejectionReason: 'Canceled', rejectionReasonAt: new Date() },
  }).catch((err) => console.error('[interview-meetings.cancel] stamp rejectionReason failed:', err))

  await applyStageTrigger({
    sessionId: meeting.sessionId,
    workspaceId: ws.workspaceId,
    event: 'meeting_cancelled',
    legacyStatus: 'rejected',
  }).catch((err) => console.error('[interview-meetings.cancel] applyStageTrigger failed:', err))

  return NextResponse.json({ ok: true, alreadyCancelled: false, calendarDeleted })
}
