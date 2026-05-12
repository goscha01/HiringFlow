// Unit tests for the multi-key rate limiter that gates the capture API.
// No DB or HTTP — pure in-process token bucket.

import { afterEach, describe, expect, it } from 'vitest'
import {
  checkCaptureRateLimit,
  extractIp,
  __resetCaptureRateLimitsForTests,
} from '../capture-rate-limit'

afterEach(() => {
  __resetCaptureRateLimitsForTests()
})

describe('extractIp', () => {
  it('uses the first entry in x-forwarded-for', () => {
    const req = { headers: { get: (h: string) => (h === 'x-forwarded-for' ? '203.0.113.7, 10.0.0.1' : null) } }
    expect(extractIp(req)).toBe('203.0.113.7')
  })

  it('falls back to "unknown" when the header is missing', () => {
    const req = { headers: { get: () => null } }
    expect(extractIp(req)).toBe('unknown')
  })

  it('trims whitespace', () => {
    const req = { headers: { get: () => '   1.2.3.4   ' } }
    expect(extractIp(req)).toBe('1.2.3.4')
  })
})

describe('checkCaptureRateLimit — presign', () => {
  it('permits requests under the per-session ceiling', () => {
    for (let i = 0; i < 30; i++) {
      const v = checkCaptureRateLimit({ route: 'presign', sessionId: 'sess-1' })
      expect(v.ok).toBe(true)
    }
  })

  it('rejects the 31st per-session request with retryAfterSec > 0', () => {
    for (let i = 0; i < 30; i++) checkCaptureRateLimit({ route: 'presign', sessionId: 'sess-2' })
    const v = checkCaptureRateLimit({ route: 'presign', sessionId: 'sess-2' })
    expect(v.ok).toBe(false)
    expect(v.scope).toBe('session')
    expect(v.retryAfterSec).toBeGreaterThan(0)
  })

  it('rejects on per-IP cap before per-session if both are configured', () => {
    // perIp = 60 in presign; 60 hits from different sessions on one IP
    // should saturate IP first.
    for (let i = 0; i < 60; i++) {
      checkCaptureRateLimit({ route: 'presign', ip: '1.2.3.4', sessionId: `s-${i}` })
    }
    const v = checkCaptureRateLimit({ route: 'presign', ip: '1.2.3.4', sessionId: 'never-used' })
    expect(v.ok).toBe(false)
    expect(v.scope).toBe('ip')
  })

  it('does not pollute across routes — finalize bucket is independent of presign', () => {
    for (let i = 0; i < 30; i++) checkCaptureRateLimit({ route: 'presign', sessionId: 'sess-3' })
    // Presign should now be at the limit
    expect(checkCaptureRateLimit({ route: 'presign', sessionId: 'sess-3' }).ok).toBe(false)
    // Finalize is a separate bucket
    expect(checkCaptureRateLimit({ route: 'finalize', sessionId: 'sess-3' }).ok).toBe(true)
  })
})

describe('checkCaptureRateLimit — playback', () => {
  it('permits 120 requests per IP per minute', () => {
    for (let i = 0; i < 120; i++) {
      expect(checkCaptureRateLimit({ route: 'playback', ip: '1.2.3.4' }).ok).toBe(true)
    }
  })

  it('rejects the 121st per-IP request', () => {
    for (let i = 0; i < 120; i++) checkCaptureRateLimit({ route: 'playback', ip: '5.6.7.8' })
    const v = checkCaptureRateLimit({ route: 'playback', ip: '5.6.7.8' })
    expect(v.ok).toBe(false)
    expect(v.scope).toBe('ip')
  })

  it('per-workspace cap of 240 holds across different IPs', () => {
    // 120 hits from each of two IPs → 240 hits on the same workspace
    for (let i = 0; i < 120; i++) {
      checkCaptureRateLimit({ route: 'playback', ip: 'a', workspaceId: 'ws-1' })
    }
    for (let i = 0; i < 120; i++) {
      checkCaptureRateLimit({ route: 'playback', ip: 'b', workspaceId: 'ws-1' })
    }
    // A third IP that hasn't been used should still hit the workspace cap.
    const v = checkCaptureRateLimit({ route: 'playback', ip: 'c', workspaceId: 'ws-1' })
    expect(v.ok).toBe(false)
    expect(v.scope).toBe('workspace')
  })
})

describe('checkCaptureRateLimit — no keys supplied', () => {
  it('returns ok when no scope is provided (no-op)', () => {
    // A route mis-call that supplies neither IP nor session should not
    // block — the limiter is permissive when there's nothing to key on.
    expect(checkCaptureRateLimit({ route: 'presign' }).ok).toBe(true)
  })
})
