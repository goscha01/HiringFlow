/**
 * Shared logic for turning a Google Calendar event into HireFunnel state.
 *
 * Extracted from the webhook route so it can be reused by the manual
 * "Sync calendar now" backfill endpoint. Both call sites have identical
 * semantics: match the event to a session, log a SchedulingEvent of the
 * right type, update pipeline status, and (best-effort) adopt the Meet
 * space for v2 lifecycle events.
 */

import type { calendar_v3 } from 'googleapis'
import { prisma } from './prisma'
import { logSchedulingEvent, updatePipelineStatus } from './scheduling'
import { fireMeetingScheduledAutomations } from './automation'
import { meetIntegrationEnabled } from './meet/feature-flag'
import { getSpaceByMeetingCode, parseMeetingCodeFromUrl, updateSpaceSettings } from './meet/google-meet'
import { subscribeSpace } from './meet/workspace-events'
import { getAuthedClientForWorkspace, hasMeetScopes } from './google'

export interface ProcessEventResult {
  matched: boolean
  eventType?: 'meeting_scheduled' | 'meeting_rescheduled' | 'meeting_cancelled'
  sessionId?: string
}

export async function processCalendarEvent(
  workspaceId: string,
  event: calendar_v3.Schema$Event,
): Promise<ProcessEventResult> {
  if (!event.id) return { matched: false }

  const sessionId = await matchSession(workspaceId, event)
  if (!sessionId) return { matched: false }

  const start = event.start?.dateTime || event.start?.date
  const end = event.end?.dateTime || event.end?.date
  const meetingUrl = event.hangoutLink || extractMeetingLink(event.location) || extractMeetingLink(event.description)

  if (event.status === 'cancelled') {
    await logSchedulingEvent({
      sessionId,
      eventType: 'meeting_cancelled',
      metadata: { googleEventId: event.id, source: 'google_calendar' },
    })
    return { matched: true, eventType: 'meeting_cancelled', sessionId }
  }

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
      attendeeEmail: event.attendees?.find((a) => !a.self)?.email || null,
      source: 'google_calendar',
    },
  })

  if (eventType === 'meeting_scheduled') {
    await updatePipelineStatus(sessionId, 'scheduled').catch(() => {})
    await fireMeetingScheduledAutomations(sessionId).catch((err) => {
      console.error('[GCal] fireMeetingScheduledAutomations failed:', err)
    })
    await adoptExternalMeet(workspaceId, sessionId, event, start, end, meetingUrl).catch((err) => {
      console.error('[GCal] adoptExternalMeet failed (non-fatal):', (err as Error).message)
    })
  }

  return { matched: true, eventType, sessionId }
}

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

  const existing = await prisma.interviewMeeting.findUnique({ where: { googleCalendarEventId: event.id } })
  if (existing) return

  const authed = await getAuthedClientForWorkspace(workspaceId)
  if (!authed) return
  if (!hasMeetScopes(authed.integration.grantedScopes)) return

  let space
  try {
    space = await getSpaceByMeetingCode(authed.client, code)
  } catch (err: unknown) {
    console.log('[AdoptMeet] spaces.get failed for code', code, (err as Error).message)
    return
  }

  // Calendly / direct calendar invites create the Meet space without recording
  // configured. Patch the space to ON when the workspace can record so the
  // adopted meeting auto-records the same way an in-app scheduled one would.
  // Space settings are mutable until a participant joins, so this works as
  // long as the calendar event lands more than a moment before the meeting.
  let recordingTurnedOn = space.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration === 'ON'
  let transcriptionTurnedOn = space.config?.artifactConfig?.transcriptionConfig?.autoTranscriptionGeneration === 'ON'
  if (authed.integration.recordingCapable && !recordingTurnedOn) {
    try {
      const updated = await updateSpaceSettings(authed.client, space.name, {
        autoRecording: 'ON',
        autoTranscription: 'ON',
      })
      recordingTurnedOn = updated.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration === 'ON'
      transcriptionTurnedOn = updated.config?.artifactConfig?.transcriptionConfig?.autoTranscriptionGeneration === 'ON'
      console.log('[AdoptMeet] enabled auto-recording on adopted space', space.name)
    } catch (err) {
      // Non-fatal: meeting may already be in progress, or the API rejected
      // the patch. Fall through and persist with whatever settings the space
      // currently has.
      console.warn('[AdoptMeet] updateSpaceSettings failed:', (err as Error).message)
    }
  }

  let subName: string | null = null
  let subExpires: Date | null = null
  try {
    const sub = await subscribeSpace(authed.client, space.name)
    subName = sub.name
    subExpires = sub.expireTime ? new Date(sub.expireTime) : null
  } catch (err) {
    console.error('[AdoptMeet] subscribeSpace failed:', (err as Error).message)
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
      recordingEnabled: recordingTurnedOn,
      recordingProvider: recordingTurnedOn ? 'google_meet' : null,
      recordingState: recordingTurnedOn ? 'requested' : 'disabled',
      transcriptState: transcriptionTurnedOn ? 'processing' : 'disabled',
      workspaceEventsSubName: subName,
      workspaceEventsSubExpiresAt: subExpires,
    },
  }).catch((err) => {
    console.log('[AdoptMeet] insert skipped (likely race):', (err as Error).message)
  })
}

async function matchSession(
  workspaceId: string,
  event: calendar_v3.Schema$Event,
): Promise<string | null> {
  const haystack = [event.description, event.summary, event.location].filter(Boolean).join(' ')
  const utm = haystack.match(/utm_content=([a-zA-Z0-9_-]+)/)
  if (utm) {
    const match = await prisma.session.findFirst({
      where: { id: utm[1], workspaceId },
      select: { id: true },
    })
    if (match) return match.id
  }

  const attendeeEmails = (event.attendees || [])
    .map((a) => a.email)
    .filter((e): e is string => !!e && !e.includes('calendar.google.com'))

  for (const email of attendeeEmails) {
    // Case-insensitive email match — Google preserves casing as entered, but
    // we want to match a candidate even if their session was registered with
    // mixed case.
    const match = await prisma.session.findFirst({
      where: { workspaceId, candidateEmail: { equals: email, mode: 'insensitive' } },
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
