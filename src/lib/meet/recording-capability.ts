/**
 * Recording + transcription capability detection.
 *
 * The source of truth is an authoritative probe: try to set
 * `autoRecordingGeneration='ON'` (and `autoTranscriptionGeneration='ON'`) on a
 * throwaway Meet space and observe whether the Meet API persists each flag.
 * Hosted domain (userinfo.hd) is a *soft UX hint only* — never trusted as a
 * capability signal: free Gmail may gain recording in the future, Workspace
 * Business Starter may lack it today, so we never infer from the domain.
 *
 * Why the two are probed *together but tracked separately*: Workspace
 * Individual / personal Gmail commonly accepts the transcription flag while
 * silently dropping the recording flag — verified against a real account on
 * 2026-05-04. Tying transcription to recording's capability incorrectly
 * disables a feature that actually works.
 *
 * Results are cached on GoogleIntegration.{recording,transcription}Capable
 * with reason codes + checkedAt timestamps. Re-probed every 30 days or on
 * reconnect.
 */

import { prisma } from '../prisma'
import { getAuthedClientForWorkspace } from '../google'
import { createSpace, MeetApiError } from './google-meet'

export type RecordingCapabilityReason =
  | 'probe_ok'
  | 'probe_not_run'
  | 'probe_error'
  | 'permission_denied_plan'
  | 'permission_denied_admin_policy'
  | 'permission_denied_other'
  | 'no_integration'

const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface CapabilityResult {
  capable: boolean | null
  reason: RecordingCapabilityReason
  checkedAt: Date | null
  fromCache: boolean
}

export interface CombinedCapability {
  recording: CapabilityResult
  transcription: CapabilityResult
}

/**
 * Read both cached capabilities for a workspace. Does not run a probe.
 */
export async function getCachedCapability(workspaceId: string): Promise<CombinedCapability> {
  const row = await prisma.googleIntegration.findUnique({
    where: { workspaceId },
    select: {
      recordingCapable: true,
      recordingCapabilityCheckedAt: true,
      recordingCapabilityReason: true,
      transcriptionCapable: true,
      transcriptionCapabilityCheckedAt: true,
      transcriptionCapabilityReason: true,
    },
  })
  if (!row) {
    const none: CapabilityResult = { capable: null, reason: 'no_integration', checkedAt: null, fromCache: true }
    return { recording: none, transcription: none }
  }
  return {
    recording: {
      capable: row.recordingCapable,
      reason: (row.recordingCapabilityReason as RecordingCapabilityReason) || 'probe_not_run',
      checkedAt: row.recordingCapabilityCheckedAt,
      fromCache: true,
    },
    transcription: {
      capable: row.transcriptionCapable,
      reason: (row.transcriptionCapabilityReason as RecordingCapabilityReason) || 'probe_not_run',
      checkedAt: row.transcriptionCapabilityCheckedAt,
      fromCache: true,
    },
  }
}

function isStale(checkedAt: Date | null | undefined): boolean {
  if (!checkedAt) return true
  return Date.now() - checkedAt.getTime() > STALE_AFTER_MS
}

/**
 * Run an authoritative probe: attempt to create a Meet space with both
 * recording AND transcription set ON, then read back which flags actually
 * persisted. Caches the result for both features independently.
 *
 * Returns the new combined capability. Cleans up the probe space on success.
 */
export async function probeRecordingCapability(workspaceId: string): Promise<CombinedCapability> {
  const authed = await getAuthedClientForWorkspace(workspaceId)
  if (!authed) {
    const none: CapabilityResult = { capable: null, reason: 'no_integration', checkedAt: null, fromCache: false }
    return { recording: none, transcription: none }
  }
  const { client } = authed

  let recording: { capable: boolean | null; reason: RecordingCapabilityReason } = { capable: null, reason: 'probe_error' }
  let transcription: { capable: boolean | null; reason: RecordingCapabilityReason } = { capable: null, reason: 'probe_error' }
  let probeSpaceName: string | null = null

  try {
    const space = await createSpace(client, { autoRecording: 'ON', autoTranscription: 'ON' })
    probeSpaceName = space.name
    const recPersisted = space.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration
    const txPersisted = space.config?.artifactConfig?.transcriptionConfig?.autoTranscriptionGeneration
    recording = recPersisted === 'ON'
      ? { capable: true, reason: 'probe_ok' }
      : { capable: false, reason: 'permission_denied_plan' }
    transcription = txPersisted === 'ON'
      ? { capable: true, reason: 'probe_ok' }
      : { capable: false, reason: 'permission_denied_plan' }
  } catch (err) {
    if (err instanceof MeetApiError && err.status === 403) {
      const reason = err.recordingReason ?? 'permission_denied_other'
      // 403 on space creation typically denies the *request*, not just one flag.
      // Mark both unknown so a follow-up per-flag probe can disambiguate.
      recording = { capable: false, reason }
      transcription = { capable: null, reason: 'probe_error' }
    } else if (err instanceof MeetApiError) {
      recording = { capable: null, reason: 'probe_error' }
      transcription = { capable: null, reason: 'probe_error' }
    } else {
      recording = { capable: null, reason: 'probe_error' }
      transcription = { capable: null, reason: 'probe_error' }
    }
  }

  // Best-effort cleanup of the probe space.
  if (probeSpaceName) {
    try {
      const { endActiveConference } = await import('./google-meet')
      await endActiveConference(client, probeSpaceName)
    } catch { /* ignore */ }
  }

  const now = new Date()
  await prisma.googleIntegration.update({
    where: { workspaceId },
    data: {
      recordingCapable: recording.capable,
      recordingCapabilityReason: recording.reason,
      recordingCapabilityCheckedAt: now,
      transcriptionCapable: transcription.capable,
      transcriptionCapabilityReason: transcription.reason,
      transcriptionCapabilityCheckedAt: now,
    },
  }).catch(() => { /* best-effort */ })

  return {
    recording: { ...recording, checkedAt: now, fromCache: false },
    transcription: { ...transcription, checkedAt: now, fromCache: false },
  }
}

/**
 * Return cached capabilities, refreshing via probe if either is stale or
 * missing. Callers that want a cache-only read should use getCachedCapability.
 */
export async function ensureRecordingCapability(workspaceId: string): Promise<CombinedCapability> {
  const cached = await getCachedCapability(workspaceId)
  if (cached.recording.reason === 'no_integration') return cached
  const recStale = cached.recording.capable === null || isStale(cached.recording.checkedAt)
  const txStale = cached.transcription.capable === null || isStale(cached.transcription.checkedAt)
  if (!recStale && !txStale) return cached
  return probeRecordingCapability(workspaceId)
}

/**
 * Return a user-facing explanation string given a capability reason. Wording
 * is deliberately generic — we never say "business account required" because
 * the real constraint is a qualifying Google plan or admin policy, not the
 * presence of a hosted domain.
 */
export function capabilityMessage(reason: RecordingCapabilityReason | null | undefined): string {
  switch (reason) {
    case 'probe_ok':
      return 'Recording is available on this Google account.'
    case 'permission_denied_plan':
      return 'Recording requires a qualifying Google plan. Upgrade your Google Workspace plan to enable recording.'
    case 'permission_denied_admin_policy':
      return 'Recording is disabled by your Google Workspace admin. Ask your admin to allow Meet recording for your account.'
    case 'permission_denied_other':
      return 'Recording is not available on this Google account.'
    case 'probe_error':
      return 'We could not verify recording support. Try again later, or reconnect your Google account.'
    case 'no_integration':
      return 'Connect a Google account to enable recording.'
    case 'probe_not_run':
    default:
      return "We'll check recording availability when you schedule your first interview."
  }
}
