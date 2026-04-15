import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pullChangedEvents } from '@/lib/google'
import { logSchedulingEvent, updatePipelineStatus } from '@/lib/scheduling'
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
  }
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
