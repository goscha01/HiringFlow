import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pullChangedEvents, getAuthedClientForWorkspace, hasMeetScopes } from '@/lib/google'
import { logSchedulingEvent, updatePipelineStatus } from '@/lib/scheduling'
import { fireMeetingScheduledAutomations } from '@/lib/automation'
import { meetIntegrationEnabled } from '@/lib/meet/feature-flag'
import { getSpaceByMeetingCode, parseMeetingCodeFromUrl } from '@/lib/meet/google-meet'
import { subscribeSpace } from '@/lib/meet/workspace-events'
import type { calendar_v3 } from 'googleapis'

// Google Calendar push notifications use these headers:
//   X-Goog-Channel-Id       — our channel ID
//   X-Goog-Channel-Token    — the secret we passed at watch time
//   X-Goog-Resource-State   — "sync" (initial) | "exists" (change) | "not_exists" (deleted)
//   X-Goog-Resource-Id      — calendar resource
export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id')
  const channelToken = request.headers.get('x-goog-channel-token')
  const resourceState = request.headers.get('x-goog-resource-state')

  console.log(`[Google webhook] hit channelId=${channelId} state=${resourceState}`)

  if (!channelId || !channelToken) {
    return NextResponse.json({ error: 'Missing channel headers' }, { status: 400 })
  }

  const integration = await prisma.googleIntegration.findUnique({
    where: { watchChannelId: channelId },
  })
  if (!integration || integration.watchToken !== channelToken) {
    return NextResponse.json({ error: 'Unknown or invalid channel' }, { status: 401 })
  }

  // Google sends a `sync` notification right after watch creation — ignore it.
  if (resourceState === 'sync') {
    return NextResponse.json({ ok: true, ignored: 'sync' })
  }

  try {
    const { events } = await pullChangedEvents(integration.workspaceId)
    for (const event of events) {
      await processEvent(integration.workspaceId, event)
    }
    return NextResponse.json({ ok: true, processed: events.length })
  } catch (err: any) {
    console.error('[Google webhook] Error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Processing failed' }, { status: 500 })
  }
}

async function processEvent(workspaceId: string, event: calendar_v3.Schema$Event) {
  if (!event.id) return

  // Try to match this event back to a HireFunnel session.
  const sessionId = await matchSession(workspaceId, event)
  if (!sessionId) return // unmatched — silently skip for now

  const start = event.start?.dateTime || event.start?.date
  const end = event.end?.dateTime || event.end?.date
  const meetingUrl = event.hangoutLink || extractMeetingLink(event.location) || extractMeetingLink(event.description)

  // Cancelled?
  if (event.status === 'cancelled') {
    await logSchedulingEvent({
      sessionId,
      eventType: 'meeting_cancelled',
      metadata: {
        googleEventId: event.id,
        source: 'google_calendar',
      },
    })
    return
  }

  // Is this a reschedule of an event we've already recorded?
  const existing = await prisma.schedulingEvent.findFirst({
    where: {
      sessionId,
      eventType: { in: ['meeting_scheduled', 'meeting_rescheduled'] },
      metadata: { path: ['googleEventId'], equals: event.id },
    },
    orderBy: { eventAt: 'desc' },
  })

  const eventType = existing ? 'meeting_rescheduled' : 'meeting_scheduled'

  await logSchedulingEvent({
    sessionId,
    eventType,
    metadata: {
      scheduledAt: start || null,
      endAt: end || null,
      meetingUrl: meetingUrl || null,
      googleEventId: event.id,
      attendeeEmail: event.attendees?.find(a => !a.self)?.email || null,
      source: 'google_calendar',
    },
  })

  if (eventType === 'meeting_scheduled') {
    await updatePipelineStatus(sessionId, 'scheduled').catch(() => {})
    await fireMeetingScheduledAutomations(sessionId).catch((err) => {
      console.error('[Google webhook] fireMeetingScheduledAutomations failed:', err)
    })
    // Best-effort: if the calendar event has a Google Meet link, adopt it into
    // the Meet integration v2 flow so meeting_started/ended/recording_ready
    // fire for externally-created (e.g. Calendly) bookings too. Failures here
    // are non-fatal — the legacy timeline entry is already written.
    await adoptExternalMeet(workspaceId, sessionId, event, start, end, meetingUrl).catch((err) => {
      console.error('[Google webhook] adoptExternalMeet failed (non-fatal):', err?.message || err)
    })
  }
}

/**
 * Given a Calendly-booked (or any externally-created) Google Meet event,
 * try to create a matching InterviewMeeting row and subscribe to Workspace
 * Events for that space. This gives us meeting_started/ended/recording_ready
 * lifecycle events without requiring the user to schedule through our UI.
 *
 * Silently skipped if: Meet v2 flag is off, Meet scopes aren't granted, the
 * event has no hangoutLink, the meeting code can't be parsed, or we don't
 * have API access to that space (403/404).
 */
async function adoptExternalMeet(
  workspaceId: string,
  sessionId: string,
  event: calendar_v3.Schema$Event,
  start: string | null | undefined,
  end: string | null | undefined,
  meetingUrl: string | null,
): Promise<void> {
  if (!event.id || !start || !end) return
  const enabled = await meetIntegrationEnabled(workspaceId)
  if (!enabled) return

  const code = parseMeetingCodeFromUrl(meetingUrl || event.hangoutLink)
  if (!code) return

  // Already adopted?
  const existing = await prisma.interviewMeeting.findUnique({ where: { googleCalendarEventId: event.id } })
  if (existing) return

  const authed = await getAuthedClientForWorkspace(workspaceId)
  if (!authed) return
  if (!hasMeetScopes(authed.integration.grantedScopes)) return

  let space
  try {
    space = await getSpaceByMeetingCode(authed.client, code)
  } catch (err: unknown) {
    // 403 is expected when the connected account isn't the Meet space owner
    // (e.g., the Calendly integration created it under a different account).
    console.log('[AdoptMeet] spaces.get failed for code', code, (err as Error).message)
    return
  }

  let subName: string | null = null
  let subExpires: Date | null = null
  try {
    const sub = await subscribeSpace(authed.client, space.name)
    subName = sub.name
    subExpires = sub.expireTime ? new Date(sub.expireTime) : null
  } catch (err) {
    console.error('[AdoptMeet] subscribeSpace failed:', (err as Error).message)
    // Proceed — we still want the InterviewMeeting row even without subscription,
    // so the user sees the meeting surfaced in the UI and we can try to subscribe
    // later via the renewal cron.
  }

  await prisma.interviewMeeting.create({
    data: {
      workspaceId,
      sessionId,
      meetSpaceName: space.name,
      meetingCode: space.meetingCode || code,
      meetingUri: space.meetingUri || meetingUrl || '',
      googleCalendarEventId: event.id,
      scheduledStart: new Date(start),
      scheduledEnd: new Date(end),
      recordingEnabled: space.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration === 'ON',
      recordingProvider: null,
      recordingState: 'disabled',
      transcriptState: 'disabled',
      workspaceEventsSubName: subName,
      workspaceEventsSubExpiresAt: subExpires,
    },
  }).catch((err) => {
    // Race condition: another webhook fired for the same event and already adopted.
    console.log('[AdoptMeet] insert skipped (likely race):', (err as Error).message)
  })
  console.log('[AdoptMeet] adopted externally-created Meet', space.name, 'for session', sessionId)
}

async function matchSession(workspaceId: string, event: calendar_v3.Schema$Event): Promise<string | null> {
  // 1. Look for utm_content=<sessionId> in description (we append this when building Calendly links)
  const haystack = [event.description, event.summary, event.location].filter(Boolean).join(' ')
  const utm = haystack.match(/utm_content=([a-zA-Z0-9_-]+)/)
  if (utm) {
    const match = await prisma.session.findFirst({
      where: { id: utm[1], workspaceId },
      select: { id: true },
    })
    if (match) return match.id
  }

  // 2. Match by attendee email to a candidate in this workspace (prefer most recent with an invite_sent)
  const attendeeEmails = (event.attendees || [])
    .map(a => a.email)
    .filter((e): e is string => !!e && !e.includes('calendar.google.com'))

  for (const email of attendeeEmails) {
    const match = await prisma.session.findFirst({
      where: { workspaceId, candidateEmail: email },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    })
    if (match) return match.id
  }

  return null
}

function extractMeetingLink(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/https?:\/\/[^\s<>"']+(meet\.google\.com|zoom\.us|teams\.microsoft\.com|whereby\.com)[^\s<>"']*/i)
  return match ? match[0] : null
}
