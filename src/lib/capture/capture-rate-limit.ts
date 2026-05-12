// Capture Engine — multi-key token bucket rate limiter.
//
// Mirrors the existing in-process pattern used by
// src/app/api/public/booking/[configId]/start/route.ts (`rateOk(ip)`) but
// generalised so a single request can be gated by IP + session + workspace
// at once. Hits per-process memory only — fine for moderate traffic, and the
// project doesn't yet have Redis/Upstash configured for rate limiting. Move
// to Upstash Ratelimit once we see real abuse.
//
// Use from API routes:
//
//   const verdict = checkCaptureRateLimit({
//     route: 'presign',
//     ip,
//     sessionId,
//     workspaceId,
//   })
//   if (!verdict.ok) {
//     captureLog('capture_upload_failed', { sessionId, reason: 'rate_limited' })
//     return NextResponse.json(
//       { error: 'Too many requests, please wait and try again.', code: 'rate_limited' },
//       { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSec) } }
//     )
//   }
//
// Limits intentionally generous — a fast retake loop should not get blocked.
// They exist to backstop runaway scripts and accidental DOS.
//
// TODO(rate-limit-store): swap the Map for Upstash Redis or a Vercel KV-backed
// implementation before multi-region. Today every Lambda gets its own bucket,
// so a single client hitting two regions doubles their effective quota.

export type CaptureRouteKey = 'presign' | 'finalize' | 'playback' | 'list'

type Bucket = { count: number; resetAt: number }

// One Map per scope keeps lookups O(1) without combining the key spaces.
// Keys inside are the actual values (IP string, sessionId UUID, etc.).
const buckets: Record<CaptureRouteKey, Map<string, Bucket>> = {
  presign: new Map(),
  finalize: new Map(),
  playback: new Map(),
  list: new Map(),
}

// Per-route + per-scope limits. count = max requests within windowMs.
// Tuned to comfortably cover happy-path use:
//   - presign: candidate may presign 1 + retakes (≤ 20) per step; cap at 30
//     per session per 10 min so retake loops never trip the limiter.
//   - finalize: same envelope; finalize is the last step in each take.
//   - playback: recruiter UI re-fetches when audio element rebinds; cap 60
//     per workspace per minute, 30 per IP per minute.
//   - IP cap is the brute-force backstop — generous for shared NAT, tight
//     enough that a single script can't pound presign forever.
const LIMITS: Record<CaptureRouteKey, {
  perIp?: { count: number; windowMs: number }
  perSession?: { count: number; windowMs: number }
  perWorkspace?: { count: number; windowMs: number }
}> = {
  presign: {
    perIp: { count: 60, windowMs: 10 * 60_000 },
    perSession: { count: 30, windowMs: 10 * 60_000 },
  },
  finalize: {
    perIp: { count: 60, windowMs: 10 * 60_000 },
    perSession: { count: 30, windowMs: 10 * 60_000 },
  },
  playback: {
    perIp: { count: 120, windowMs: 60_000 },
    perWorkspace: { count: 240, windowMs: 60_000 },
  },
  list: {
    perIp: { count: 120, windowMs: 60_000 },
    perWorkspace: { count: 240, windowMs: 60_000 },
  },
}

function tick(map: Map<string, Bucket>, key: string, count: number, windowMs: number): {
  ok: boolean
  retryAfterSec: number
} {
  const now = Date.now()
  const cur = map.get(key)
  if (!cur || now >= cur.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }
  if (cur.count >= count) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) }
  }
  cur.count++
  return { ok: true, retryAfterSec: 0 }
}

export interface CaptureRateLimitInput {
  route: CaptureRouteKey
  ip?: string | null
  sessionId?: string | null
  workspaceId?: string | null
}

export interface CaptureRateLimitVerdict {
  ok: boolean
  retryAfterSec: number
  // Which scope caused the rejection — useful for log + 429 body.
  scope?: 'ip' | 'session' | 'workspace'
}

export function checkCaptureRateLimit(opts: CaptureRateLimitInput): CaptureRateLimitVerdict {
  const cfg = LIMITS[opts.route]
  const map = buckets[opts.route]

  if (cfg.perIp && opts.ip) {
    const r = tick(map, `ip:${opts.ip}`, cfg.perIp.count, cfg.perIp.windowMs)
    if (!r.ok) return { ok: false, retryAfterSec: r.retryAfterSec, scope: 'ip' }
  }
  if (cfg.perSession && opts.sessionId) {
    const r = tick(map, `s:${opts.sessionId}`, cfg.perSession.count, cfg.perSession.windowMs)
    if (!r.ok) return { ok: false, retryAfterSec: r.retryAfterSec, scope: 'session' }
  }
  if (cfg.perWorkspace && opts.workspaceId) {
    const r = tick(map, `w:${opts.workspaceId}`, cfg.perWorkspace.count, cfg.perWorkspace.windowMs)
    if (!r.ok) return { ok: false, retryAfterSec: r.retryAfterSec, scope: 'workspace' }
  }
  return { ok: true, retryAfterSec: 0 }
}

export function extractIp(request: { headers: { get(name: string): string | null } }): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

// Test-only reset. Vitest can call this between tests to keep buckets
// independent. Not exposed in any production code path.
export function __resetCaptureRateLimitsForTests(): void {
  for (const k of Object.keys(buckets) as CaptureRouteKey[]) {
    buckets[k].clear()
  }
}
