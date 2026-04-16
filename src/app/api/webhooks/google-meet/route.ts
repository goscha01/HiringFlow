/**
 * POST /api/webhooks/google-meet
 *
 * Pub/Sub push endpoint for Google Workspace Events (Meet). Verifies the
 * shared token + OIDC JWT, decodes the CloudEvent, and dispatches to
 * typed state transitions on InterviewMeeting.
 *
 * Three-layer persistence per event:
 *   1. Idempotency ledger: ProcessedWorkspaceEvent (meetSpaceName, cloudEventId).
 *   2. Raw CloudEvent appended to InterviewMeeting.rawEvents.
 *   3. Typed SchedulingEvent timeline entry + state field mutation.
 *
 * Loose coupling: any Drive fetch or automation dispatch is wrapped in
 * try/catch so a downstream failure does not prevent the ack and does not
 * break the rest of the app.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthedClientForWorkspace, getAppUrl } from '@/lib/google'
import { verifyPubsubJwt } from '@/lib/meet/pubsub-jwt'
import {
  findByMeetSpaceName,
  appendRawEvent,
  appendParticipant,
  markConferenceStarted,
  markConferenceEnded,
  markRecordingReady,
  markTranscriptReady,
  recordProcessedEvent,
} from '@/lib/meet/interview-meeting'
import { logSchedulingEvent } from '@/lib/scheduling'
import { renewSubscription } from '@/lib/meet/workspace-events'
import { getFileMeta } from '@/lib/meet/google-drive'
import { fireMeetingLifecycleAutomations } from '@/lib/automation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PubsubPushBody {
  message?: {
    data?: string
    attributes?: Record<string, string>
    messageId?: string
    publishTime?: string
  }
  subscription?: string
}

interface MeetEventPayload {
  // Google Workspace Events v1 CloudEvent payload body
  space?: { name: string }
  conferenceRecord?: { name: string; space?: { name: string }; startTime?: string; endTime?: string }
  participant?: {
    name?: string
    signedinUser?: { displayName?: string; user?: string }
    anonymousUser?: { displayName?: string }
    phoneUser?: { displayName?: string }
    earliestStartTime?: string
    latestEndTime?: string
  }
  recording?: {
    name?: string
    driveDestination?: { file?: string; exportUri?: string }
    state?: string
    startTime?: string
    endTime?: string
  }
  transcript?: {
    name?: string
    docsDestination?: { document?: string; exportUri?: string }
    state?: string
  }
}

interface CloudEventEnvelope {
  id?: string
  type?: string
  source?: string
  subject?: string
  time?: string
  data?: MeetEventPayload
}

function expectedAudience(): string {
  // The Pub/Sub push subscription is configured with the full endpoint URL as
  // its OIDC audience. If the env overrides it, use that — otherwise default
  // to the canonical app URL + path.
  return process.env.GOOGLE_MEET_WEBHOOK_AUDIENCE
    || `${getAppUrl()}/api/webhooks/google-meet`
}

async function verifyRequest(request: NextRequest): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  // Layer 1: shared token
  const expectedToken = process.env.GOOGLE_MEET_WEBHOOK_TOKEN
  if (expectedToken) {
    const tok = request.nextUrl.searchParams.get('token')
    if (tok !== expectedToken) return { ok: false, status: 401, error: 'bad_token' }
  }

  // Layer 2: OIDC JWT (optional — absent only in dev/tests)
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    try {
      await verifyPubsubJwt(auth.slice('Bearer '.length), {
        expectedAudience: expectedAudience(),
        expectedEmail: process.env.GOOGLE_MEET_WEBHOOK_SA_EMAIL || undefined,
      })
    } catch (err) {
      return { ok: false, status: 401, error: `jwt_invalid: ${(err as Error).message}` }
    }
  } else if (process.env.GOOGLE_MEET_WEBHOOK_REQUIRE_JWT === '1') {
    return { ok: false, status: 401, error: 'missing_jwt' }
  }

  return { ok: true }
}

export async function POST(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (!auth.ok) {
    console.warn('[Meet webhook] verification failed:', auth.error)
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: PubsubPushBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }
  const message = body.message
  if (!message?.data) return NextResponse.json({ ok: true, ignored: 'no_data' })

  let envelope: CloudEventEnvelope
  try {
    const decoded = Buffer.from(message.data, 'base64').toString('utf8')
    envelope = JSON.parse(decoded)
  } catch (err) {
    console.error('[Meet webhook] failed to decode message data:', err)
    return NextResponse.json({ error: 'bad_envelope' }, { status: 400 })
  }

  const eventType = envelope.type || message.attributes?.['ce-type']
  const cloudEventId = envelope.id || message.attributes?.['ce-id'] || message.messageId
  if (!eventType) return NextResponse.json({ ok: true, ignored: 'no_type' })
  if (!cloudEventId) return NextResponse.json({ ok: true, ignored: 'no_id' })

  // Every Meet event carries either space.name directly or conferenceRecord.space.name
  const meetSpaceName =
    envelope.data?.space?.name ||
    envelope.data?.conferenceRecord?.space?.name ||
    null
  if (!meetSpaceName) {
    console.warn('[Meet webhook] no space name in envelope', eventType)
    return NextResponse.json({ ok: true, ignored: 'no_space' })
  }

  const meeting = await findByMeetSpaceName(meetSpaceName)
  if (!meeting) {
    // Event for a space we don't own (e.g., probe space). Ack so Pub/Sub stops retrying.
    console.log('[Meet webhook] unknown space, ignoring', meetSpaceName, eventType)
    return NextResponse.json({ ok: true, ignored: 'unknown_space' })
  }

  // Idempotency check
  const { firstTime } = await recordProcessedEvent(meetSpaceName, cloudEventId, eventType)
  if (!firstTime) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Layer 1 persistence: raw CloudEvent (best-effort, non-fatal)
  await appendRawEvent(meeting.id, {
    id: cloudEventId,
    type: eventType,
    receivedAt: new Date().toISOString(),
    payload: envelope.data ?? null,
  }).catch((err) => console.error('[Meet webhook] appendRawEvent failed:', err))

  // Layer 2+3 persistence — dispatch on event type
  try {
    switch (eventType) {
      case 'google.workspace.meet.conference.v2.started': {
        const at = new Date(envelope.data?.conferenceRecord?.startTime || envelope.time || Date.now())
        await markConferenceStarted(meeting.id, at)
        await logSchedulingEvent({
          sessionId: meeting.sessionId,
          eventType: 'meeting_started',
          metadata: { interviewMeetingId: meeting.id, at: at.toISOString() },
        })
        fireMeetingLifecycleAutomations(meeting.sessionId, 'meeting_started').catch(() => {})
        break
      }
      case 'google.workspace.meet.conference.v2.ended': {
        const at = new Date(envelope.data?.conferenceRecord?.endTime || envelope.time || Date.now())
        await markConferenceEnded(meeting.id, at)
        await logSchedulingEvent({
          sessionId: meeting.sessionId,
          eventType: 'meeting_ended',
          metadata: { interviewMeetingId: meeting.id, at: at.toISOString() },
        })
        fireMeetingLifecycleAutomations(meeting.sessionId, 'meeting_ended').catch(() => {})
        break
      }
      case 'google.workspace.meet.recording.v2.fileGenerated': {
        const driveFileId = envelope.data?.recording?.driveDestination?.file || null
        if (driveFileId) {
          await markRecordingReady(meeting.id, driveFileId)
          // Fetch metadata for later display (non-fatal)
          try {
            const authed = await getAuthedClientForWorkspace(meeting.workspaceId)
            if (authed) await getFileMeta(authed.client, driveFileId)
          } catch (err) { console.error('[Meet webhook] Drive meta fetch failed:', err) }
          await logSchedulingEvent({
            sessionId: meeting.sessionId,
            eventType: 'recording_ready',
            metadata: { interviewMeetingId: meeting.id, driveFileId },
          })
          fireMeetingLifecycleAutomations(meeting.sessionId, 'recording_ready').catch(() => {})
        }
        break
      }
      case 'google.workspace.meet.transcript.v2.fileGenerated': {
        const docId = envelope.data?.transcript?.docsDestination?.document || null
        if (docId) {
          await markTranscriptReady(meeting.id, docId)
          await logSchedulingEvent({
            sessionId: meeting.sessionId,
            eventType: 'transcript_ready',
            metadata: { interviewMeetingId: meeting.id, driveFileId: docId },
          })
          fireMeetingLifecycleAutomations(meeting.sessionId, 'transcript_ready').catch(() => {})
        }
        break
      }
      case 'google.workspace.meet.participant.v2.joined':
      case 'google.workspace.meet.participant.v2.left': {
        const p = envelope.data?.participant
        const email = p?.signedinUser?.user || null
        const displayName =
          p?.signedinUser?.displayName ||
          p?.anonymousUser?.displayName ||
          p?.phoneUser?.displayName || null
        await appendParticipant(meeting.id, {
          email,
          displayName,
          joinTime: p?.earliestStartTime,
          leaveTime: p?.latestEndTime,
        })
        break
      }
      case 'google.workspace.events.subscription.v1.expirationReminder': {
        // In-band renewal — the primary keep-alive mechanism.
        if (meeting.workspaceEventsSubName) {
          try {
            const authed = await getAuthedClientForWorkspace(meeting.workspaceId)
            if (authed) {
              const renewed = await renewSubscription(authed.client, meeting.workspaceEventsSubName)
              await prisma.interviewMeeting.update({
                where: { id: meeting.id },
                data: { workspaceEventsSubExpiresAt: renewed.expireTime ? new Date(renewed.expireTime) : null },
              })
              console.log('[Meet webhook] renewed subscription', meeting.workspaceEventsSubName)
            }
          } catch (err) {
            console.error('[Meet webhook] subscription renewal failed:', err)
          }
        }
        break
      }
      default:
        console.log('[Meet webhook] unhandled event type', eventType)
    }
  } catch (err) {
    console.error('[Meet webhook] dispatch failed:', err)
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, type: eventType })
}
