/**
 * POST /api/interview-meetings/[id]/reschedule
 *
 * Recruiter-initiated reschedule from the candidate detail page. Patches the
 * Google Calendar event to the new time (sendUpdates='all' so the candidate
 * gets the updated invite), updates the InterviewMeeting row so the UI is
 * responsive, logs `meeting_rescheduled`, re-keys queued before_meeting
 * reminders, and fires `meeting_rescheduled` automations.
 *
 * The Google Calendar watch will fire shortly after the patch; the
 * phantom-reschedule guard in `processCalendarEvent` sees that the latest
 * SchedulingEvent.metadata.scheduledAt already matches the new start and
 * skips the duplicate-log path.
 *
 * Body: { scheduledAt: ISO string, durationMinutes?: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAuthedClientForWorkspace, hasMeetScopes } from '@/lib/google'
import { logSchedulingEvent } from '@/lib/scheduling'
import { fireMeetingRescheduledAutomations, rescheduleBeforeMeetingReminders } from '@/lib/automation'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const meeting = await prisma.interviewMeeting.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: {
      id: true,
      sessionId: true,
      googleCalendarEventId: true,
      scheduledStart: true,
      scheduledEnd: true,
      meetingUri: true,
    },
  })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    scheduledAt?: string
    durationMinutes?: number
  }
  if (!body.scheduledAt || isNaN(new Date(body.scheduledAt).getTime())) {
    return NextResponse.json({ error: 'Valid scheduledAt (ISO string) required' }, { status: 400 })
  }

  const newStart = new Date(body.scheduledAt)
  const previousDurationMs = meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()
  const durationMs = typeof body.durationMinutes === 'number' && body.durationMinutes > 0
    ? body.durationMinutes * 60_000
    : previousDurationMs
  const newEnd = new Date(newStart.getTime() + durationMs)

  if (
    newStart.getTime() === meeting.scheduledStart.getTime() &&
    newEnd.getTime() === meeting.scheduledEnd.getTime()
  ) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  const authed = await getAuthedClientForWorkspace(ws.workspaceId)
  if (!authed) {
    return NextResponse.json({ error: 'Google account not connected' }, { status: 409 })
  }
  if (!hasMeetScopes(authed.integration.grantedScopes)) {
    return NextResponse.json({ error: 'reconnect_required', message: 'Reconnect your Google account to reschedule meetings' }, { status: 409 })
  }

  const calendar = google.calendar({ version: 'v3', auth: authed.client })
  try {
    await calendar.events.patch({
      calendarId: authed.integration.calendarId,
      eventId: meeting.googleCalendarEventId,
      sendUpdates: 'all',
      requestBody: {
        start: { dateTime: newStart.toISOString() },
        end: { dateTime: newEnd.toISOString() },
      },
    })
  } catch (err) {
    console.error('[interview-meetings.reschedule] calendar.events.patch failed:', err)
    return NextResponse.json({ error: 'calendar_patch_failed', message: (err as Error).message }, { status: 502 })
  }

  await prisma.interviewMeeting.update({
    where: { id: meeting.id },
    data: { scheduledStart: newStart, scheduledEnd: newEnd },
  })

  await logSchedulingEvent({
    sessionId: meeting.sessionId,
    eventType: 'meeting_rescheduled',
    metadata: {
      interviewMeetingId: meeting.id,
      scheduledAt: newStart.toISOString(),
      endAt: newEnd.toISOString(),
      meetingUrl: meeting.meetingUri,
      googleEventId: meeting.googleCalendarEventId,
      source: 'recruiter_manual',
      rescheduledBy: ws.userId,
    },
  }).catch((err) => console.error('[interview-meetings.reschedule] logSchedulingEvent failed:', err))

  await rescheduleBeforeMeetingReminders(meeting.sessionId, newStart).catch((err) =>
    console.error('[interview-meetings.reschedule] rescheduleBeforeMeetingReminders failed:', err))
  await fireMeetingRescheduledAutomations(meeting.sessionId).catch((err) =>
    console.error('[interview-meetings.reschedule] fireMeetingRescheduledAutomations failed:', err))

  return NextResponse.json({
    ok: true,
    scheduledStart: newStart.toISOString(),
    scheduledEnd: newEnd.toISOString(),
  })
}
