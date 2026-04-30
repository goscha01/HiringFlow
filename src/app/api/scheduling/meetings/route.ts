import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncWorkspaceMeetings } from '@/lib/meet/sync-on-read'

// Returns all logged meetings for the workspace (manual + future webhook-sourced).
// Filters out invite/click events — only meeting_* and marked_scheduled rows.
export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  // Pull fresh state from Meet API for any stale meetings before listing —
  // covers personal-Gmail tenants where Workspace Events doesn't deliver and
  // Workspace tenants whose push delivery hiccupped. No-show automations fire
  // here for any meetings that have crossed scheduledEnd + grace.
  await syncWorkspaceMeetings(ws.workspaceId).catch((err) =>
    console.error('[scheduling.meetings] syncWorkspaceMeetings failed:', err),
  )

  const events = await prisma.schedulingEvent.findMany({
    where: {
      session: { workspaceId: ws.workspaceId },
      eventType: { in: ['meeting_scheduled', 'meeting_rescheduled', 'marked_scheduled'] },
    },
    include: {
      session: { select: { id: true, candidateName: true, candidateEmail: true } },
      schedulingConfig: { select: { id: true, name: true } },
    },
    orderBy: { eventAt: 'desc' },
    take: 200,
  })

  // Collapse: keep only the most recent event per session (latest reschedule wins).
  const seen = new Set<string>()
  const collapsed = events.filter(e => {
    if (seen.has(e.sessionId)) return false
    seen.add(e.sessionId)
    return true
  })

  // Check for cancellations — if latest event for session is cancelled, exclude it
  const cancelledSessions = await prisma.schedulingEvent.findMany({
    where: {
      session: { workspaceId: ws.workspaceId },
      eventType: 'meeting_cancelled',
      sessionId: { in: collapsed.map(e => e.sessionId) },
    },
    select: { sessionId: true, eventAt: true },
  })
  const cancelledMap = new Map(cancelledSessions.map(c => [c.sessionId, c.eventAt.getTime()]))

  const active = collapsed.filter(e => {
    const cancelAt = cancelledMap.get(e.sessionId)
    return !cancelAt || cancelAt < e.eventAt.getTime()
  })

  // Join each event to its InterviewMeeting (Meet integration v2 row) via the
  // calendar event id stored in the SchedulingEvent metadata. This is what
  // tells the UI whether the adopted Meet space will record.
  const calendarEventIds = active
    .map(e => (e.metadata as Record<string, unknown> | null)?.googleEventId as string | undefined)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const interviewMeetings = calendarEventIds.length
    ? await prisma.interviewMeeting.findMany({
        where: { workspaceId: ws.workspaceId, googleCalendarEventId: { in: calendarEventIds } },
        select: {
          id: true,
          googleCalendarEventId: true,
          recordingEnabled: true,
          recordingState: true,
          recordingProvider: true,
          transcriptState: true,
          driveRecordingFileId: true,
          actualStart: true,
          actualEnd: true,
        },
      })
    : []
  const meetingByCalEvent = new Map(interviewMeetings.map(m => [m.googleCalendarEventId, m]))

  // No-show status: mark the row if a meeting_no_show SchedulingEvent exists
  // for the same InterviewMeeting.
  const noShowSet = new Set<string>()
  if (interviewMeetings.length) {
    const noShowEvents = await prisma.schedulingEvent.findMany({
      where: {
        sessionId: { in: active.map(e => e.sessionId) },
        eventType: 'meeting_no_show',
      },
      select: { metadata: true },
    })
    for (const ev of noShowEvents) {
      const id = (ev.metadata as Record<string, unknown> | null)?.interviewMeetingId
      if (typeof id === 'string') noShowSet.add(id)
    }
  }

  return NextResponse.json(active.map(e => {
    const calEventId = (e.metadata as Record<string, unknown> | null)?.googleEventId as string | undefined
    const im = calEventId ? meetingByCalEvent.get(calEventId) : undefined
    return {
      id: e.id,
      eventType: e.eventType,
      eventAt: e.eventAt,
      metadata: e.metadata,
      session: e.session,
      schedulingConfig: e.schedulingConfig,
      noShow: im ? noShowSet.has(im.id) : false,
      recording: im
        ? {
            enabled: im.recordingEnabled,
            state: im.recordingState,
            provider: im.recordingProvider,
            transcriptState: im.transcriptState,
            hasFile: !!im.driveRecordingFileId,
            actualStart: im.actualStart,
            actualEnd: im.actualEnd,
          }
        : null,
    }
  }))
}
