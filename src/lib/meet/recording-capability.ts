/**
 * Recording capability detection.
 *
 * The source of truth is an authoritative probe: try to set
 * `autoRecordingGeneration='ON'` on a throwaway Meet space and observe whether
 * the Meet API accepts it. Hosted domain (userinfo.hd) is a *soft UX hint
 * only* — never trusted as a recording signal. This is the key correction
 * from the earlier plan: free Gmail may gain recording in the future,
 * Workspace Business Starter may lack it today, so we never infer from the
 * domain.
 *
 * Result is cached on GoogleIntegration.recordingCapable with a reason code
 * and checkedAt timestamp. Re-probed every 30 days or on reconnect.
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

/**
 * Read the cached capability for a workspace. Does not run a probe.
 */
export async function getCachedCapability(workspaceId: string): Promise<CapabilityResult> {
  const row = await prisma.googleIntegration.findUnique({
    where: { workspaceId },
    select: {
      recordingCapable: true,
      recordingCapabilityCheckedAt: true,
      recordingCapabilityReason: true,
    },
  })
  if (!row) {
    return { capable: null, reason: 'no_integration', checkedAt: null, fromCache: true }
  }
  return {
    capable: row.recordingCapable,
    reason: (row.recordingCapabilityReason as RecordingCapabilityReason) || 'probe_not_run',
    checkedAt: row.recordingCapabilityCheckedAt,
    fromCache: true,
  }
}

function isStale(checkedAt: Date | null | undefined): boolean {
  if (!checkedAt) return true
  return Date.now() - checkedAt.getTime() > STALE_AFTER_MS
}

/**
 * Run an authoritative probe: attempt to create a Meet space with recording
 * ON. Classifies the outcome into a reason code and caches the result.
 *
 * Returns the new capability result. Cleans up the probe space on success.
 */
export async function probeRecordingCapability(workspaceId: string): Promise<CapabilityResult> {
  const authed = await getAuthedClientForWorkspace(workspaceId)
  if (!authed) {
    return { capable: null, reason: 'no_integration', checkedAt: null, fromCache: false }
  }
  const { client } = authed

  let capable: boolean | null = null
  let reason: RecordingCapabilityReason = 'probe_error'
  let probeSpaceName: string | null = null

  try {
    const space = await createSpace(client, { autoRecording: 'ON', autoTranscription: 'OFF' })
    probeSpaceName = space.name
    // Did the server persist the requested config? Some tiers silently drop
    // the recording flag. Treat silent drop as not-capable.
    const persisted = space.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration
    if (persisted === 'ON') {
      capable = true
      reason = 'probe_ok'
    } else {
      capable = false
      reason = 'permission_denied_plan'
    }
  } catch (err) {
    if (err instanceof MeetApiError && err.status === 403) {
      capable = false
      reason = err.recordingReason ?? 'permission_denied_other'
    } else if (err instanceof MeetApiError) {
      capable = null
      reason = 'probe_error'
    } else {
      capable = null
      reason = 'probe_error'
    }
  }

  // Best-effort cleanup of the probe space — the Meet API does not support
  // delete for spaces, but ending any active conference is harmless. Silence
  // errors here; leaving a phantom unused space behind is acceptable.
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
      recordingCapable: capable,
      recordingCapabilityReason: reason,
      recordingCapabilityCheckedAt: now,
    },
  }).catch(() => { /* best-effort */ })

  return { capable, reason, checkedAt: now, fromCache: false }
}

/**
 * Return capability, refreshing via probe if the cached value is stale or
 * missing. Callers that want a cache-only read should use getCachedCapability.
 */
export async function ensureRecordingCapability(workspaceId: string): Promise<CapabilityResult> {
  const cached = await getCachedCapability(workspaceId)
  if (cached.reason === 'no_integration') return cached
  if (cached.capable !== null && !isStale(cached.checkedAt)) return cached
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
