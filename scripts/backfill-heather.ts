/**
 * One-off backfill for Heather Simmons's stranded meeting:
 *   1. Re-bind InterviewMeeting from the original Meet space (hux-pgsu-wkj)
 *      to the post-reschedule space (yuw-xjho-bro).
 *   2. Patch the new space to autoRecording=ON / autoTranscription=ON since
 *      the workspace is recordingCapable.
 *   3. Subscribe to the new space (best-effort; won't fire on personal Gmail).
 *   4. Re-run sync-on-read which (with the new code) finds the Gemini Notes
 *      doc, emits meeting_started + meeting_ended SchedulingEvents, and fires
 *      the stage trigger so the kanban card moves off "Meeting Scheduled".
 */
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import { createDecipheriv, createHash } from 'crypto'
import { findAttendanceForMeeting } from '../src/lib/meet/attendance-fallback'
import { logSchedulingEvent } from '../src/lib/scheduling'
import { fireMeetingLifecycleAutomations } from '../src/lib/automation'

const prisma = new PrismaClient()
const ALGO = 'aes-256-gcm'
const MEET_BASE = 'https://meet.googleapis.com/v2'
const WSE_BASE = 'https://workspaceevents.googleapis.com/v1'

function decrypt(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':')
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || ''
  const key = createHash('sha256').update(secret).digest()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
}

async function main() {
  const HEATHER_SESSION_ID = '45e97d98-a5d8-49cc-acc2-a93c886e0f61'
  const NEW_CODE = 'yuw-xjho-bro'

  const session = await prisma.session.findUnique({ where: { id: HEATHER_SESSION_ID }, select: { workspaceId: true, candidateName: true, pipelineStatus: true } })
  if (!session) throw new Error('session not found')
  console.log('Pre-backfill pipelineStatus:', session.pipelineStatus)

  const integ = await prisma.googleIntegration.findUnique({ where: { workspaceId: session.workspaceId } })
  if (!integ) throw new Error('no integration')
  const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
  oauth.setCredentials({
    refresh_token: decrypt(integ.refreshToken),
    access_token: integ.accessToken ? decrypt(integ.accessToken) : undefined,
    expiry_date: integ.accessExpiresAt?.getTime(),
  })
  const tok = (await oauth.getAccessToken())?.token!

  // Look up new space
  const sr = await fetch(`${MEET_BASE}/spaces/${NEW_CODE}`, { headers: { Authorization: `Bearer ${tok}` } })
  if (!sr.ok) throw new Error(`spaces.get: ${sr.status} ${await sr.text()}`)
  const newSpace = await sr.json() as { name: string; meetingCode?: string; meetingUri?: string; config?: { artifactConfig?: { recordingConfig?: { autoRecordingGeneration?: string }; transcriptionConfig?: { autoTranscriptionGeneration?: string } } } }
  console.log('New space:', newSpace.name)
  console.log('  recording=', newSpace.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration)
  console.log('  transcription=', newSpace.config?.artifactConfig?.transcriptionConfig?.autoTranscriptionGeneration)

  // Patch to ON for both (the meeting already happened, but if reschedule
  // happens again on the same space we want it correct).
  const recOn = newSpace.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration === 'ON'
  const txOn = newSpace.config?.artifactConfig?.transcriptionConfig?.autoTranscriptionGeneration === 'ON'
  if (!recOn || !txOn) {
    const updateMask = [
      ...(!recOn ? ['config.artifactConfig.recordingConfig.autoRecordingGeneration'] : []),
      ...(!txOn ? ['config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration'] : []),
    ].join(',')
    const body = {
      config: {
        artifactConfig: {
          ...(!recOn ? { recordingConfig: { autoRecordingGeneration: 'ON' } } : {}),
          ...(!txOn ? { transcriptionConfig: { autoTranscriptionGeneration: 'ON' } } : {}),
        },
      },
    }
    const pr = await fetch(`${MEET_BASE}/${newSpace.name}?updateMask=${encodeURIComponent(updateMask)}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    console.log('PATCH new space:', pr.status, pr.ok ? 'ok' : await pr.text())
  }

  // Subscribe to new space (best-effort).
  let subName: string | null = null
  let subExpires: Date | null = null
  if (process.env.GCP_MEET_PUBSUB_TOPIC) {
    const subBody = {
      targetResource: `//meet.googleapis.com/${newSpace.name}`,
      eventTypes: [
        'google.workspace.meet.conference.v2.started',
        'google.workspace.meet.conference.v2.ended',
        'google.workspace.meet.recording.v2.fileGenerated',
        'google.workspace.meet.transcript.v2.fileGenerated',
        'google.workspace.meet.participant.v2.joined',
        'google.workspace.meet.participant.v2.left',
      ],
      notificationEndpoint: { pubsubTopic: process.env.GCP_MEET_PUBSUB_TOPIC },
      ttl: '604800s',
    }
    const sr2 = await fetch(`${WSE_BASE}/subscriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(subBody),
    })
    if (sr2.ok) {
      const op = await sr2.json() as { done?: boolean; response?: { name?: string; expireTime?: string } }
      if (op.done && op.response?.name) {
        subName = op.response.name
        subExpires = op.response.expireTime ? new Date(op.response.expireTime) : null
        console.log('Subscribed:', subName, 'expires', subExpires)
      } else {
        console.log('Subscription op pending; not capturing name')
      }
    } else {
      console.log('Subscribe failed:', sr2.status, await sr2.text())
    }
  }

  // Update the InterviewMeeting row.
  const meeting = await prisma.interviewMeeting.findFirst({
    where: { sessionId: HEATHER_SESSION_ID },
    orderBy: { createdAt: 'desc' },
  })
  if (!meeting) throw new Error('no meeting')

  // Pick up scheduledStart/End from the most recent reschedule SchedulingEvent
  // — the original InterviewMeeting row still has the pre-reschedule times.
  const latestResched = await prisma.schedulingEvent.findFirst({
    where: { sessionId: HEATHER_SESSION_ID, eventType: { in: ['meeting_scheduled', 'meeting_rescheduled'] } },
    orderBy: { eventAt: 'desc' },
    select: { metadata: true },
  })
  const meta = (latestResched?.metadata as Record<string, string> | null) ?? {}
  const newScheduledStart = meta.scheduledAt ? new Date(meta.scheduledAt) : meeting.scheduledStart
  const newScheduledEnd = meta.endAt ? new Date(meta.endAt) : meeting.scheduledEnd
  console.log('Updating scheduled window:', newScheduledStart.toISOString(), '→', newScheduledEnd.toISOString())

  await prisma.interviewMeeting.update({
    where: { id: meeting.id },
    data: {
      meetSpaceName: newSpace.name,
      meetingCode: newSpace.meetingCode || NEW_CODE,
      meetingUri: newSpace.meetingUri || `https://meet.google.com/${NEW_CODE}`,
      scheduledStart: newScheduledStart,
      scheduledEnd: newScheduledEnd,
      recordingEnabled: true,  // we asked Google for ON above
      recordingProvider: 'google_meet',
      recordingState: 'requested',  // sync-on-read will move to ready/disabled
      transcriptState: 'processing',
      workspaceEventsSubName: subName,
      workspaceEventsSubExpiresAt: subExpires,
      spaceAdoptedFromReschedule: true,
      driveRecordingFileId: null,
      driveTranscriptFileId: null,
      driveGeminiNotesFileId: null,
      attendanceSheetFileId: null,
      meetApiSyncedAt: null,
      actualStart: null,
      actualEnd: null,
      participants: undefined,
      rawEvents: undefined,
    },
  })
  console.log('Updated InterviewMeeting', meeting.id, '→', newSpace.name)

  // Bypass the grace window — the standard sync-on-read path waits 15 min
  // after scheduledEnd before pulling state. Heather's meeting just ended;
  // we directly invoke the attendance fallback and emit the lifecycle events.
  const refreshed = await prisma.interviewMeeting.findUnique({ where: { id: meeting.id } })
  if (!refreshed) throw new Error('refreshed lookup failed')

  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
  oauth2.setCredentials({
    refresh_token: decrypt(integ.refreshToken),
    access_token: integ.accessToken ? decrypt(integ.accessToken) : undefined,
    expiry_date: integ.accessExpiresAt?.getTime(),
  })
  const att = await findAttendanceForMeeting(oauth2 as unknown as Parameters<typeof findAttendanceForMeeting>[0], {
    windowStart: refreshed.scheduledStart,
    windowEnd: refreshed.scheduledEnd,
    folderId: integ.meetRecordingsFolderId,
    candidateName: session.candidateName ?? null,
    candidateEmail: null, // not available in this script's session select
    extensionEnabled: integ.attendanceExtensionEnabled,
    sheetsScopeGranted: false,
  })
  console.log('attendance signal:', att?.source, att?.fileName)
  if (att) {
    const startAt = refreshed.scheduledStart
    const endAt = att.createdAt
    await prisma.interviewMeeting.update({
      where: { id: refreshed.id },
      data: {
        actualStart: startAt,
        actualEnd: endAt,
        ...(att.source === 'gemini_notes' ? { driveGeminiNotesFileId: att.driveFileId } : {}),
        ...(att.source === 'attendance_sheet' ? { attendanceSheetFileId: att.driveFileId } : {}),
      },
    })
    for (const eventType of ['meeting_started', 'meeting_ended'] as const) {
      const dup = await prisma.schedulingEvent.findFirst({
        where: {
          sessionId: refreshed.sessionId,
          eventType,
          metadata: { path: ['interviewMeetingId'], equals: refreshed.id },
        },
        select: { id: true },
      })
      if (dup) { console.log(eventType, 'already logged, skipping'); continue }
      await logSchedulingEvent({
        sessionId: refreshed.sessionId,
        eventType,
        metadata: {
          interviewMeetingId: refreshed.id,
          at: (eventType === 'meeting_started' ? startAt : endAt).toISOString(),
          source: 'manual_backfill',
          signal: att.source,
        },
      })
      await fireMeetingLifecycleAutomations(refreshed.sessionId, eventType)
      console.log('emitted', eventType)
    }
  }

  // Show the new state.
  const after = await prisma.session.findUnique({
    where: { id: HEATHER_SESSION_ID },
    select: { pipelineStatus: true, rejectionReason: true },
  })
  const evts = await prisma.schedulingEvent.findMany({
    where: { sessionId: HEATHER_SESSION_ID, eventType: { in: ['meeting_started', 'meeting_ended', 'meeting_no_show'] } },
    orderBy: { eventAt: 'asc' },
    select: { eventType: true, eventAt: true, metadata: true },
  })
  const im = await prisma.interviewMeeting.findUnique({
    where: { id: meeting.id },
    select: { actualStart: true, actualEnd: true, recordingState: true, driveGeminiNotesFileId: true, driveRecordingFileId: true, attendanceSheetFileId: true },
  })
  console.log('\n--- POST-BACKFILL ---')
  console.log('pipelineStatus:', after?.pipelineStatus)
  console.log('actualStart:', im?.actualStart?.toISOString())
  console.log('actualEnd:', im?.actualEnd?.toISOString())
  console.log('recordingState:', im?.recordingState)
  console.log('driveGeminiNotesFileId:', im?.driveGeminiNotesFileId)
  console.log('driveRecordingFileId:', im?.driveRecordingFileId)
  console.log('attendanceSheetFileId:', im?.attendanceSheetFileId)
  console.log('SchedulingEvents:')
  for (const e of evts) console.log(' -', e.eventAt.toISOString(), e.eventType, JSON.stringify(e.metadata))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
