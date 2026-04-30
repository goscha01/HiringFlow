/**
 * On-read sync: pulls Meet API state for an InterviewMeeting and populates
 * the typed columns + participants list, mirroring what the Workspace Events
 * webhook would have written. Lets us compute no-show / attendance without
 * relying on Pub/Sub delivery — required for personal Gmail accounts (where
 * Workspace Events is silently unsupported) and as a defense-in-depth fallback
 * for Workspace tenants when push delivery hiccups.
 *
 * Idempotent and best-effort:
 * - Skips meetings whose actualEnd is already populated (webhook beat us, or
 *   we synced earlier).
 * - Skips meetings whose scheduledEnd hasn't passed yet + a grace window —
 *   no point pulling for a meeting still in progress.
 * - Throttles repeat attempts via meetApiSyncedAt so a flapping API doesn't
 *   produce N requests per page load.
 * - All Meet API errors are caught and logged; a sync failure must never
 *   break the listing endpoint that triggered it.
 *
 * When a no-show is detected, fires the same fireMeetingLifecycleAutomations
 * pathway as the webhook handler (move to Rejected, stamp rejectionReason,
 * dispatch the no-show follow-up email rule).
 */

import type { InterviewMeeting, Prisma } from '@prisma/client'
import type { OAuth2Client } from 'google-auth-library'
import { prisma } from '../prisma'
import { fetchUserInfo, getAuthedClientForWorkspace } from '../google'
import { withWorkspaceMeetClient, listConferenceRecords, listParticipants, listRecordings, type Participant } from './google-meet'
import { findMeetRecordingsFolderId, searchMeetRecordings, inferAttendanceFromFilename } from './google-drive'
import { logSchedulingEvent } from '../scheduling'
import { fireMeetingLifecycleAutomations } from '../automation'

// Wait this long after scheduledEnd before pulling state. Avoids racing the
// recording artifact pipeline on Workspace tenants and avoids treating a
// meeting that ran 2 min over as "no conference yet".
const GRACE_AFTER_SCHEDULED_END_MS = 15 * 60 * 1000

// Don't re-pull more often than this if a previous sync already ran. Caps
// outbound API calls when many meetings are still pending recording artifacts.
const MIN_RESYNC_INTERVAL_MS = 5 * 60 * 1000

type SyncableMeeting = Pick<InterviewMeeting,
  'id' | 'workspaceId' | 'sessionId' | 'meetSpaceName' |
  'scheduledStart' | 'scheduledEnd' | 'actualEnd' | 'recordingState' |
  'meetApiSyncedAt'
>

function shouldSync(m: SyncableMeeting): boolean {
  if (m.actualEnd) {
    // Already have an end time. Only re-sync if recording is still pending and
    // we haven't checked recently.
    if (m.recordingState === 'ready' || m.recordingState === 'failed' || m.recordingState === 'unavailable' || m.recordingState === 'disabled') return false
    if (m.meetApiSyncedAt && Date.now() - m.meetApiSyncedAt.getTime() < MIN_RESYNC_INTERVAL_MS) return false
    return true
  }
  // No actualEnd — only sync once the meeting window + grace has passed.
  const end = m.scheduledEnd?.getTime()
  if (!end) return false
  if (Date.now() < end + GRACE_AFTER_SCHEDULED_END_MS) return false
  // Throttle repeat attempts within the resync window.
  if (m.meetApiSyncedAt && Date.now() - m.meetApiSyncedAt.getTime() < MIN_RESYNC_INTERVAL_MS) return false
  return true
}

/**
 * Sync a single meeting from Meet API. Safe to call on any meeting — it'll
 * no-op when shouldSync returns false. Returns true if any state was updated.
 */
export async function syncMeetingFromMeetApi(meeting: SyncableMeeting): Promise<boolean> {
  if (!shouldSync(meeting)) return false

  // Stamp the sync attempt timestamp upfront so concurrent loaders don't both
  // hit Meet API for the same meeting in parallel.
  await prisma.interviewMeeting.update({
    where: { id: meeting.id },
    data: { meetApiSyncedAt: new Date() },
  }).catch(() => {})

  // Self-heal googleUserId + googleDisplayName on integrations connected
  // before those fields were captured. The Drive recording-filename path
  // needs the display name to identify the host; the Workspace path needs
  // userId to identify the host in participants. One userinfo call covers
  // both, and only runs once per integration thanks to the not-null guards.
  await ensureHostIdentity(meeting.workspaceId).catch((err) =>
    console.error('[meet-sync] ensureHostIdentity failed:', (err as Error).message),
  )

  let updated = false
  try {
    const result = await withWorkspaceMeetClient(meeting.workspaceId, async (client) => {
      const conferences = await listConferenceRecords(client, meeting.meetSpaceName)
      if (conferences.length === 0) {
        // Empty conferenceRecords means either no one joined OR Google won't
        // return conference data for this account tier. Personal @gmail.com
        // and Workspace Individual always return empty even when the meeting
        // actually happened. For those tenants we fall back to the Drive
        // recording filename as the attendance signal — recordings still land
        // in the user's Drive even when the API conferenceRecords endpoint is
        // gated.
        const integ = await prisma.googleIntegration.findUnique({
          where: { workspaceId: meeting.workspaceId },
          select: { hostedDomain: true, googleDisplayName: true, meetRecordingsFolderId: true },
        })
        if (integ?.hostedDomain) {
          // Workspace tenant — empty really means no conference happened.
          await maybeFlagNoShow(meeting, [], { reason: 'no_conference_started' })
          return false
        }
        // Personal Gmail / Workspace Individual fallback path.
        const driveOutcome = await syncFromDriveRecording(client, meeting, integ?.googleDisplayName ?? null, integ?.meetRecordingsFolderId ?? null)
        if (driveOutcome.updated) updated = true
        return driveOutcome.updated
      }

      // Use the most recent conference. (Multiple are possible if the host
      // reopened the space; the latest one is what the candidate would have
      // joined.)
      const conf = [...conferences].sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''))[0]
      const participants = await listParticipants(client, conf.name)

      const data: Prisma.InterviewMeetingUpdateInput = {}
      if (conf.startTime) data.actualStart = new Date(conf.startTime)
      if (conf.endTime) data.actualEnd = new Date(conf.endTime)
      data.participants = participants.map(toParticipantRow) as unknown as Prisma.InputJsonValue

      // Recording artifact (best-effort)
      try {
        const recs = await listRecordings(client, conf.name)
        const rec = recs[0]
        if (rec?.driveDestination?.file && rec.state === 'FILE_GENERATED') {
          data.recordingState = 'ready'
          data.driveRecordingFileId = rec.driveDestination.file
        } else if (rec && rec.state && rec.state !== 'FILE_GENERATED') {
          // Recording exists but artifact not finalized yet.
          if (meeting.recordingState !== 'ready') data.recordingState = 'processing'
        }
      } catch (err) {
        console.error('[meet-sync] listRecordings failed for', meeting.id, ':', (err as Error).message)
      }

      await prisma.interviewMeeting.update({ where: { id: meeting.id }, data })
      updated = true

      // No-show evaluation, but only once we have a real end time. Mid-meeting
      // pulls (if a recruiter loads the page during the call) won't flag.
      if (conf.endTime) {
        await maybeFlagNoShow(meeting, participants.map(toParticipantRow))
      }
      return true
    })
    return result || updated
  } catch (err) {
    console.error('[meet-sync] failed for meeting', meeting.id, ':', (err as Error).message)
    return updated
  }
}

/**
 * Sync every meeting in a workspace whose state is stale and could benefit.
 * Concurrency-capped so we never fan out to dozens of Meet API calls on a
 * single page load.
 */
export async function syncWorkspaceMeetings(workspaceId: string): Promise<number> {
  const candidates = await prisma.interviewMeeting.findMany({
    where: { workspaceId },
    select: {
      id: true, workspaceId: true, sessionId: true, meetSpaceName: true,
      scheduledStart: true, scheduledEnd: true, actualEnd: true,
      recordingState: true, meetApiSyncedAt: true,
    },
  })
  const stale = candidates.filter(shouldSync)
  if (stale.length === 0) return 0

  const CONCURRENCY = 4
  let synced = 0
  for (let i = 0; i < stale.length; i += CONCURRENCY) {
    const batch = stale.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((m) => syncMeetingFromMeetApi(m)))
    synced += results.filter(Boolean).length
  }
  return synced
}

function toParticipantRow(p: Participant): { email: string | null; displayName: string | null; joinTime?: string; leaveTime?: string } {
  return {
    // Despite the field name, this stores `users/{id}` for signed-in users —
    // matches what the webhook handler writes and what evaluateNoShow expects.
    email: p.signedinUser?.user || null,
    displayName: p.signedinUser?.displayName || p.anonymousUser?.displayName || p.phoneUser?.displayName || null,
    joinTime: p.earliestStartTime,
    leaveTime: p.latestEndTime,
  }
}

/**
 * Drive-recording fallback for personal Gmail / Workspace Individual tenants.
 *
 * Strategy: query the user's Meet Recordings folder for video files created
 * within the meeting window with the candidate's name in the filename. If
 * found, the filename pattern (`<X> and <Y>`) tells us who attended. If not
 * found within an extended window, we leave the meeting alone — recruiters
 * can still mark no-show manually.
 *
 * Returns whether anything was written to the InterviewMeeting row.
 */
async function syncFromDriveRecording(
  client: OAuth2Client,
  meeting: SyncableMeeting,
  hostDisplayName: string | null,
  cachedFolderId: string | null,
): Promise<{ updated: boolean }> {
  if (!hostDisplayName) {
    console.log('[meet-sync] no host display name on integration — Drive filename heuristic needs it; skipping for', meeting.id)
    return { updated: false }
  }

  const session = await prisma.session.findUnique({
    where: { id: meeting.sessionId },
    select: { candidateName: true },
  })
  if (!session?.candidateName) return { updated: false }

  // Resolve folder id (cache hit or one Drive call).
  let folderId = cachedFolderId
  if (!folderId) {
    folderId = await findMeetRecordingsFolderId(client).catch((err) => {
      console.error('[meet-sync] findMeetRecordingsFolderId failed:', (err as Error).message)
      return null
    })
    if (folderId) {
      await prisma.googleIntegration.update({
        where: { workspaceId: meeting.workspaceId },
        data: { meetRecordingsFolderId: folderId },
      }).catch(() => {})
    }
    // No folder yet → user has never recorded. Bail without flagging.
    if (!folderId) return { updated: false }
  }

  // Search window: 1h before scheduledStart through 3h after scheduledEnd.
  // Recording files are written at the *end* of the meeting, so the lower
  // bound only matters if Drive's createdTime races with the meeting start.
  const start = meeting.scheduledStart ?? new Date(0)
  const end = meeting.scheduledEnd ?? new Date(Date.now() + 24 * 60 * 60 * 1000)
  const candidates = await searchMeetRecordings(client, {
    folderId,
    candidateName: session.candidateName,
    createdAfter: new Date(start.getTime() - 60 * 60 * 1000),
    createdBefore: new Date(end.getTime() + 3 * 60 * 60 * 1000),
    limit: 5,
  }).catch((err) => {
    console.error('[meet-sync] searchMeetRecordings failed:', (err as Error).message)
    return []
  })

  // Pick the recording whose filename names the candidate (most precise) or
  // fall back to the most recent. Prefer matches where the host name also
  // appears, since that confirms it's the same call (vs an unrelated file).
  let chosen = candidates.find((f) => {
    const inf = inferAttendanceFromFilename(f.name, hostDisplayName, session.candidateName!)
    return inf?.hasHost && inf?.hasCandidate
  })
  if (!chosen) chosen = candidates[0]
  if (!chosen) return { updated: false }

  const inferred = inferAttendanceFromFilename(chosen.name, hostDisplayName, session.candidateName)
  const data: Prisma.InterviewMeetingUpdateInput = {
    driveRecordingFileId: chosen.id,
    recordingState: 'ready',
    // We don't have precise actualStart/End from Drive, but the recording's
    // createdTime is right after the meeting ends — close enough that the UI
    // shows "Ended" instead of "Missed". scheduledStart stays authoritative
    // for the start time.
    actualEnd: chosen.createdTime ? new Date(chosen.createdTime) : new Date(),
  }
  await prisma.interviewMeeting.update({ where: { id: meeting.id }, data })

  // No-show inference from filename. If parsing failed, leave it alone — the
  // recruiter can still manually mark no-show.
  if (inferred && inferred.nonHostCount === 0) {
    // Filename has only the host → no-show.
    await maybeFlagNoShow(meeting, [], { reason: 'drive_recording_host_only' })
  }
  return { updated: true }
}

/**
 * Backfill googleUserId + googleDisplayName on the workspace's integration
 * if either is missing. One userinfo call, idempotent — both downstream
 * paths (no-show evaluation, Drive filename matching) need these.
 */
async function ensureHostIdentity(workspaceId: string): Promise<void> {
  const integ = await prisma.googleIntegration.findUnique({
    where: { workspaceId },
    select: { googleUserId: true, googleDisplayName: true },
  })
  if (integ?.googleUserId && integ?.googleDisplayName) return
  const authed = await getAuthedClientForWorkspace(workspaceId)
  if (!authed) return
  const info = await fetchUserInfo(authed.client)
  const updates: Record<string, unknown> = {}
  if (info.id && !integ?.googleUserId) updates.googleUserId = info.id
  if (info.displayName && !integ?.googleDisplayName) updates.googleDisplayName = info.displayName
  if (Object.keys(updates).length > 0) {
    await prisma.googleIntegration.update({ where: { workspaceId }, data: updates }).catch(() => {})
  }
}

async function maybeFlagNoShow(
  meeting: { id: string; sessionId: string; workspaceId: string },
  participants: Array<{ email: string | null; displayName: string | null }>,
  context: { reason?: string } = {},
): Promise<void> {
  // Skip if we already logged it.
  const existing = await prisma.schedulingEvent.findFirst({
    where: {
      sessionId: meeting.sessionId,
      eventType: 'meeting_no_show',
      metadata: { path: ['interviewMeetingId'], equals: meeting.id },
    },
    select: { id: true },
  })
  if (existing) return

  // ensureHostIdentity (called at the top of syncMeetingFromMeetApi) has
  // already populated googleUserId where possible. Read the latest value.
  const integ = await prisma.googleIntegration.findUnique({
    where: { workspaceId: meeting.workspaceId },
    select: { googleUserId: true },
  })
  const hostUserId = integ?.googleUserId ?? null

  // Decide.
  let noShow = false
  let nonHostCount = 0
  if (participants.length === 0) {
    noShow = true
  } else if (hostUserId) {
    const hostKey = `users/${hostUserId}`
    nonHostCount = participants.filter((p) => p.email !== hostKey).length
    noShow = nonHostCount === 0
  } else {
    // No host id and not zero participants — can't decide. Bail rather than
    // false-positive on a real attendance.
    return
  }
  if (!noShow) return

  await logSchedulingEvent({
    sessionId: meeting.sessionId,
    eventType: 'meeting_no_show',
    metadata: {
      interviewMeetingId: meeting.id,
      at: new Date().toISOString(),
      nonHostCount,
      source: 'meet_api_sync',
      ...(context.reason ? { reason: context.reason } : {}),
    },
  })
  await fireMeetingLifecycleAutomations(meeting.sessionId, 'meeting_no_show').catch((err) => {
    console.error('[meet-sync] no-show automations failed:', err)
  })
}
