// Capture Engine — production feature flag.
//
// Two-level gating, AND-combined:
//   1. Global env flag `CAPTURE_STEPS_ENABLED` (Vercel) — emergency killswitch
//      that disables the feature platform-wide.
//   2. Per-workspace `workspace.settings.captureStepsEnabled === true` — opt-in
//      flag that controls which tenants can use the feature.
//
// Both must be on for a workspace to create or use capture steps. This stops
// the builder's Audio Answer tile (which is a global UI element) from leaking
// the feature to tenants that haven't been enabled yet.
//
// Defaults:
//   - Global flag defaults to ENABLED when the env var is unset (so dev/local
//     keeps working).
//   - Workspace flag defaults to DISABLED when missing or not strictly true.
//     A workspace must be explicitly opted in.
//
// When disabled (either level):
//   - presign API returns 503 (no new uploads accepted)
//   - public flow page hides the recorder and shows an "unavailable" notice
//   - builder hides the Audio Answer tile
//   - finalize/playback still work so in-flight uploads can complete and
//     existing recordings remain playable to recruiters in any workspace.
//
// The flags are read on every request (no module-level cache) so flipping
// either one takes effect on the next request without a redeploy.

function readEnv(): string | undefined {
  // NEXT_PUBLIC_* is inlined at build time. Server code reads the server-only
  // var; client code falls back to the public one. Server-only wins when
  // both are set.
  if (typeof process === 'undefined') return undefined
  return process.env.CAPTURE_STEPS_ENABLED ?? process.env.NEXT_PUBLIC_CAPTURE_STEPS_ENABLED
}

// Global env-level check. Use only when you don't have a workspace context
// (e.g. very early in a request before workspace lookup, or for purely UI
// gating where workspace data is loaded separately).
//
// Prefer isCaptureStepsEnabledForWorkspace() in any code path that has — or
// can cheaply load — the workspace's settings.
export function isCaptureStepsEnabled(): boolean {
  const raw = readEnv()
  if (raw === undefined) return true
  const v = String(raw).toLowerCase().trim()
  return !(v === 'false' || v === '0' || v === 'off' || v === 'no')
}

// Reads the workspace-level opt-in flag from the workspace settings JSON.
// Returns true only when the flag is strictly === true. Anything else
// (missing, false, "true" string, 1, undefined) → false. This is the safe
// default: a workspace must be explicitly opted in, not accidentally.
export function isCaptureStepsEnabledForSettings(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false
  const s = settings as Record<string, unknown>
  return s.captureStepsEnabled === true
}

// Composite check: BOTH the global env flag AND the workspace opt-in must be
// on. This is what API routes and UI gates should call.
//
// Pass the workspace.settings JSON as-is from Prisma. Null/undefined settings
// resolve to disabled, matching the strict-opt-in policy.
export function isCaptureStepsEnabledForWorkspace(opts: {
  workspaceSettings?: unknown
}): boolean {
  if (!isCaptureStepsEnabled()) return false
  return isCaptureStepsEnabledForSettings(opts.workspaceSettings)
}

// True if existing capture rows should still be playable to recruiters even
// when one of the feature flags is off. We intentionally keep this 'true' so
// a kill switch doesn't blackhole prior recordings.
export const CAPTURE_PLAYBACK_ALWAYS_ENABLED = true
