/**
 * POST /api/candidates/[id]/schedule-interview
 *
 * First-class Google Meet scheduling flow (Meet integration v2).
 *   1. Ensure feature flag + Meet scopes granted.
 *   2. Probe recording capability if requested + unknown.
 *   3. Create Meet space via Meet API (with recording per capability).
 *   4. Create Calendar event with the Meet link and candidate as attendee.
 *   5. Subscribe to Workspace Events for the space.
 *   6. Persist InterviewMeeting + SchedulingEvent, fire automations.
 *
 * Failure modes are graceful: if the subscription call fails we keep the
 * scheduled meeting (the webhook stream degrades to best-effort); if
 * recording is unavailable we scheduled without it and return a warning.
 */

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAuthedClientForWorkspace, hasMeetScopes } from '@/lib/google'
import { meetIntegrationEnabled } from '@/lib/meet/feature-flag'
import { createSpace, MeetApiError } from '@/lib/meet/google-meet'
import { subscribeSpace, WorkspaceEventsError } from '@/lib/meet/workspace-events'
import { ensureRecordingCapability, probeRecordingCapability, capabilityMessage } from '@/lib/meet/recording-capability'
import type { RecordingCapabilityReason, CombinedCapability } from '@/lib/meet/recording-capability'
import { selectRecorder } from '@/lib/meet/meeting-recorder'
import { logSchedulingEvent, updatePipelineStatus } from '@/lib/scheduling'
import { fireMeetingScheduledAutomations } from '@/lib/automation'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const enabled = await meetIntegrationEnabled(ws.workspaceId)
  if (!enabled) {
    return NextResponse.json({ error: 'Meet integration is not enabled for this workspace' }, { status: 404 })
  }

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({})) as {
    scheduledAt?: string
    durationMinutes?: number
    record?: boolean
    notes?: string
    attendeeEmail?: string
    schedulingConfigId?: string
  }
  const { scheduledAt, durationMinutes = 30, record = false, notes, schedulingConfigId } = body
  const attendeeEmail = body.attendeeEmail || session.candidateEmail || null

  if (!scheduledAt || isNaN(new Date(scheduledAt).getTime())) {
    return NextResponse.json({ error: 'Valid scheduledAt (ISO string) required' }, { status: 400 })
  }
  const start = new Date(scheduledAt)
  const end = new Date(start.getTime() + durationMinutes * 60_000)

  // Load integration + verify scopes
  const authed = await getAuthedClientForWorkspace(ws.workspaceId)
  if (!authed) {
    return NextResponse.json({ error: 'Google account not connected' }, { status: 409 })
  }
  const { client, integration } = authed
  if (!hasMeetScopes(integration.grantedScopes)) {
    return NextResponse.json({ error: 'reconnect_required', message: 'Reconnect your Google account to enable Meet scheduling' }, { status: 409 })
  }

  // Resolve recording + transcription capability independently. When the
  // caller explicitly requested recording, force a *fresh* probe whenever the
  // cached value is anything other than `true` — Google's plan tier or admin
  // policy can change between probes, and a stale `false` would silently strip
  // the recording flag from the new space without retrying.
  const noneCap: CombinedCapability = {
    recording:    { capable: null, reason: 'probe_not_run', checkedAt: null, fromCache: true },
    transcription:{ capable: null, reason: 'probe_not_run', checkedAt: null, fromCache: true },
  }
  let capabilityResult = noneCap
  try {
    if (record) {
      const cached = await ensureRecordingCapability(ws.workspaceId)
      if (cached.recording.capable === true) {
        capabilityResult = cached
      } else {
        // Stale cache or never-true → re-probe authoritatively.
        capabilityResult = await probeRecordingCapability(ws.workspaceId)
      }
    } else {
      capabilityResult = await ensureRecordingCapability(ws.workspaceId)
    }
  } catch (err) { console.error('[Schedule-interview] capability probe failed:', err) }

  const selection = selectRecorder({ record, capable: capabilityResult.recording.capable })
  const transcriptionEnabledFinal = capabilityResult.transcription.capable !== false
  const warnings: string[] = []
  if (record && !selection.recordingEnabled) {
    warnings.push(capabilityMessage(capabilityResult.recording.reason as RecordingCapabilityReason))
  }

  // --- Create Meet space ---
  // Recording and transcription are independent. Transcription doesn't gate on
  // recording capability; if the workspace can transcribe, we always try to
  // turn it on so personal-Gmail tenants still get Gemini-style notes/captions
  // even when their plan tier blocks recording.
  let space
  try {
    space = await createSpace(client, {
      accessType: 'TRUSTED',
      entryPointAccess: 'ALL',
      autoRecording: selection.recordingEnabled ? 'ON' : 'OFF',
      autoTranscription: transcriptionEnabledFinal ? 'ON' : 'OFF',
    })
  } catch (err) {
    // If the request was rejected for recording specifically, retry without
    // recording (transcription stays as requested) and cache the negative.
    if (selection.recordingEnabled && err instanceof MeetApiError && err.status === 403) {
      const reason = err.recordingReason ?? 'permission_denied_other'
      await prisma.googleIntegration.update({
        where: { workspaceId: ws.workspaceId },
        data: {
          recordingCapable: false,
          recordingCapabilityReason: reason,
          recordingCapabilityCheckedAt: new Date(),
        },
      }).catch(() => {})
      try {
        space = await createSpace(client, {
          accessType: 'TRUSTED',
          entryPointAccess: 'ALL',
          autoRecording: 'OFF',
          autoTranscription: transcriptionEnabledFinal ? 'ON' : 'OFF',
        })
        warnings.push(capabilityMessage(reason as RecordingCapabilityReason))
      } catch (err2) {
        console.error('[Schedule-interview] Meet space creation failed:', err2)
        return NextResponse.json({ error: 'meet_space_failed', message: (err2 as Error).message }, { status: 502 })
      }
    } else {
      console.error('[Schedule-interview] Meet space creation failed:', err)
      return NextResponse.json({ error: 'meet_space_failed', message: (err as Error).message }, { status: 502 })
    }
  }
  // Trust what the server actually persisted, not what we requested. The Meet
  // API silently drops unsupported flags on certain plan tiers (e.g.
  // Workspace Individual will accept transcription but drop recording even
  // when the request didn't 403).
  const persistedRecording = space!.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration === 'ON'
  const persistedTranscription = space!.config?.artifactConfig?.transcriptionConfig?.autoTranscriptionGeneration === 'ON'
  const recordingEnabledFinal = persistedRecording
  const transcriptOnFinal = persistedTranscription
  if (selection.recordingEnabled && !persistedRecording) {
    warnings.push(capabilityMessage('permission_denied_plan' as RecordingCapabilityReason))
  }

  // --- Create Calendar event ---
  const calendar = google.calendar({ version: 'v3', auth: client })
  const descriptionParts: string[] = [
    `Interview with ${session.candidateName || 'candidate'}`,
    notes ? `\nNotes: ${notes}` : '',
    `\n\n— HireFunnel (utm_content=${session.id})`,
  ]
  let calEvent
  try {
    const res = await calendar.events.insert({
      calendarId: integration.calendarId,
      sendUpdates: 'all',
      requestBody: {
        summary: `Interview — ${session.candidateName || 'Candidate'}`,
        description: descriptionParts.join(''),
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
        conferenceData: {
          conferenceSolution: { key: { type: 'hangoutsMeet' } },
          entryPoints: [{ entryPointType: 'video', uri: space!.meetingUri, meetingCode: space!.meetingCode }],
        },
      },
      conferenceDataVersion: 1,
    })
    calEvent = res.data
  } catch (err) {
    console.error('[Schedule-interview] Calendar insert failed:', err)
    return NextResponse.json({ error: 'calendar_event_failed', message: (err as Error).message }, { status: 502 })
  }
  if (!calEvent.id) {
    return NextResponse.json({ error: 'calendar_event_failed', message: 'No event id returned' }, { status: 502 })
  }

  // --- Subscribe to Workspace Events (best-effort) ---
  let subName: string | null = null
  let subExpires: Date | null = null
  try {
    const sub = await subscribeSpace(client, space!.name)
    subName = sub.name
    subExpires = sub.expireTime ? new Date(sub.expireTime) : null
  } catch (err) {
    if (err instanceof WorkspaceEventsError) {
      console.error('[Schedule-interview] subscribeSpace failed:', err.status, err.message)
    } else {
      console.error('[Schedule-interview] subscribeSpace failed:', err)
    }
    // Degrade gracefully — scheduling still succeeds. Cron will attempt to
    // create the subscription later if the subscription is null.
  }

  // --- Persist InterviewMeeting + SchedulingEvent ---
  const configId = schedulingConfigId ?? (await prisma.schedulingConfig.findFirst({
    where: { workspaceId: ws.workspaceId, isActive: true, isDefault: true }, select: { id: true },
  }))?.id ?? null

  const meeting = await prisma.interviewMeeting.create({
    data: {
      workspaceId: ws.workspaceId,
      sessionId: session.id,
      schedulingConfigId: configId,
      meetSpaceName: space!.name,
      meetingCode: space!.meetingCode,
      meetingUri: space!.meetingUri,
      googleCalendarEventId: calEvent.id,
      scheduledStart: start,
      scheduledEnd: end,
      recordingEnabled: recordingEnabledFinal,
      recordingProvider: recordingEnabledFinal ? 'google_meet' : null,
      recordingState: recordingEnabledFinal ? 'requested' : 'disabled',
      transcriptState: transcriptOnFinal ? 'processing' : 'disabled',
      workspaceEventsSubName: subName,
      workspaceEventsSubExpiresAt: subExpires,
    },
  })

  await logSchedulingEvent({
    sessionId: session.id,
    schedulingConfigId: configId,
    eventType: 'meeting_scheduled',
    metadata: {
      interviewMeetingId: meeting.id,
      scheduledAt: start.toISOString(),
      endAt: end.toISOString(),
      meetingUrl: space!.meetingUri,
      googleEventId: calEvent.id,
      recordingEnabled: recordingEnabledFinal,
      source: 'google_meet_v2',
      loggedBy: ws.userId,
      notes: notes || null,
    },
  })

  await updatePipelineStatus(session.id, 'scheduled').catch(() => {})
  await fireMeetingScheduledAutomations(session.id).catch((err) => {
    console.error('[Schedule-interview] fireMeetingScheduledAutomations failed:', err)
  })

  return NextResponse.json({
    success: true,
    interviewMeeting: {
      id: meeting.id,
      meetingUri: meeting.meetingUri,
      scheduledStart: meeting.scheduledStart,
      scheduledEnd: meeting.scheduledEnd,
      recordingEnabled: meeting.recordingEnabled,
      recordingState: meeting.recordingState,
    },
    warnings,
  })
}
