/**
 * CRUD helpers for InterviewMeeting. Centralizes the three-layer persistence
 * pattern mandated by the plan:
 *
 *   1. Raw CloudEvent appended to InterviewMeeting.rawEvents (capped ring).
 *   2. Typed state transition on InterviewMeeting (e.g. actualEnd, recordingState).
 *   3. Timeline entry as a new SchedulingEvent row (meeting_started / ended /
 *      recording_ready / transcript_ready).
 *
 * All mutations are wrapped to log and re-throw rather than silently fail —
 * the webhook handler's job is to retry via 5xx if any step fails.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'

const RAW_EVENTS_CAP = 50 // per meeting

export type MeetingRawEvent = {
  id?: string             // CloudEvent id
  type: string
  receivedAt: string
  payload: unknown
}

export async function findByMeetSpaceName(meetSpaceName: string) {
  return prisma.interviewMeeting.findUnique({ where: { meetSpaceName } })
}

export async function findByCalendarEventId(googleCalendarEventId: string) {
  return prisma.interviewMeeting.findUnique({ where: { googleCalendarEventId } })
}

export async function appendRawEvent(meetingId: string, ev: MeetingRawEvent) {
  // Load -> update pattern (fine for low event rate per meeting).
  const row = await prisma.interviewMeeting.findUnique({ where: { id: meetingId }, select: { rawEvents: true } })
  if (!row) return
  const existing = Array.isArray(row.rawEvents) ? (row.rawEvents as unknown as MeetingRawEvent[]) : []
  const next = [...existing, ev].slice(-RAW_EVENTS_CAP)
  await prisma.interviewMeeting.update({
    where: { id: meetingId },
    data: { rawEvents: next as unknown as Prisma.InputJsonValue },
  })
}

/**
 * Inspect the accumulated participant list and decide whether the candidate
 * showed up. Heuristic: anyone whose email is NOT the workspace's connected
 * Google account (host), OR any anonymous/non-email participant, counts as a
 * non-host attendee. Zero non-host entries → no-show.
 *
 * Note: this is a snapshot read, intended to be called from the conference.ended
 * handler. Late-arriving participant.joined events are not common in practice
 * but if they happen, callers can re-evaluate.
 */
export async function evaluateNoShow(
  meetingId: string,
  hostEmail: string,
): Promise<{ noShow: boolean; nonHostCount: number }> {
  const row = await prisma.interviewMeeting.findUnique({
    where: { id: meetingId },
    select: { participants: true },
  })
  if (!row) return { noShow: false, nonHostCount: 0 }
  const list = Array.isArray(row.participants)
    ? (row.participants as Array<Record<string, unknown>>)
    : []
  const hostKey = hostEmail.toLowerCase()
  const seen = new Set<string>()
  for (const p of list) {
    const email = typeof p.email === 'string' && p.email ? p.email.toLowerCase() : null
    const name = typeof p.displayName === 'string' && p.displayName ? p.displayName : null
    if (email && email === hostKey) continue
    const key = email ? `e:${email}` : name ? `n:${name}` : `anon:${seen.size}`
    seen.add(key)
  }
  return { noShow: seen.size === 0, nonHostCount: seen.size }
}

export async function appendParticipant(
  meetingId: string,
  p: { email?: string | null; displayName?: string | null; joinTime?: string; leaveTime?: string },
) {
  const row = await prisma.interviewMeeting.findUnique({ where: { id: meetingId }, select: { participants: true } })
  if (!row) return
  const existing = Array.isArray(row.participants) ? (row.participants as unknown as Array<Record<string, unknown>>) : []
  existing.push(p as Record<string, unknown>)
  await prisma.interviewMeeting.update({
    where: { id: meetingId },
    data: { participants: existing as unknown as Prisma.InputJsonValue },
  })
}

export async function markConferenceStarted(meetingId: string, at: Date) {
  await prisma.interviewMeeting.update({
    where: { id: meetingId },
    data: { actualStart: at },
  })
}

export async function markConferenceEnded(meetingId: string, at: Date) {
  await prisma.interviewMeeting.update({
    where: { id: meetingId },
    data: {
      actualEnd: at,
      // If recording was enabled and nothing has landed yet, mark processing —
      // recording.fileGenerated will flip this to 'ready'.
      recordingState: (await currentRecordingState(meetingId)) === 'requested'
        ? 'processing' : undefined,
    },
  })
}

async function currentRecordingState(meetingId: string): Promise<string> {
  const row = await prisma.interviewMeeting.findUnique({ where: { id: meetingId }, select: { recordingState: true } })
  return row?.recordingState ?? 'disabled'
}

export async function markRecordingReady(meetingId: string, driveFileId: string) {
  await prisma.interviewMeeting.update({
    where: { id: meetingId },
    data: {
      recordingState: 'ready',
      driveRecordingFileId: driveFileId,
    },
  })
}

export async function markTranscriptReady(meetingId: string, driveFileId: string) {
  await prisma.interviewMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptState: 'ready',
      driveTranscriptFileId: driveFileId,
    },
  })
}

export async function markRecordingFailed(meetingId: string) {
  await prisma.interviewMeeting.update({
    where: { id: meetingId },
    data: { recordingState: 'failed' },
  })
}

export async function updateSubscription(
  meetingId: string,
  data: { workspaceEventsSubName: string | null; workspaceEventsSubExpiresAt: Date | null },
) {
  await prisma.interviewMeeting.update({
    where: { id: meetingId },
    data,
  })
}

/**
 * Has this CloudEvent already been processed for this space? If the insert
 * throws on the unique constraint, we know it's a duplicate. This is the
 * idempotency primitive used by the webhook.
 */
export async function recordProcessedEvent(
  meetSpaceName: string,
  cloudEventId: string,
  eventType: string,
): Promise<{ firstTime: boolean }> {
  try {
    await prisma.processedWorkspaceEvent.create({
      data: { meetSpaceName, cloudEventId, eventType },
    })
    return { firstTime: true }
  } catch (err) {
    // Unique constraint — duplicate delivery.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { firstTime: false }
    }
    throw err
  }
}
