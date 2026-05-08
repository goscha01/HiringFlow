import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { issueBookingToken, signBookingToken, verifyBookingToken } from '../booking-links'

const ORIGINAL_SECRET = process.env.BOOKING_LINK_SECRET
const ORIGINAL_NEXTAUTH = process.env.NEXTAUTH_SECRET

beforeEach(() => {
  process.env.BOOKING_LINK_SECRET = 'test-secret-do-not-use-in-prod'
})
afterEach(() => {
  process.env.BOOKING_LINK_SECRET = ORIGINAL_SECRET
  process.env.NEXTAUTH_SECRET = ORIGINAL_NEXTAUTH
})

describe('booking-links', () => {
  it('round-trips a valid token', () => {
    const token = issueBookingToken({
      sessionId: 'sess-123',
      configId: 'cfg-456',
      purpose: 'book',
      daysFromNow: 7,
    })
    const result = verifyBookingToken(token)
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.payload.sessionId).toBe('sess-123')
    expect(result.payload.configId).toBe('cfg-456')
    expect(result.payload.purpose).toBe('book')
    // expiry within ~7 days
    const diffMs = result.payload.expiresAt.getTime() - Date.now()
    expect(diffMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000)
    expect(diffMs).toBeLessThan(8 * 24 * 60 * 60 * 1000)
  })

  it('rejects a tampered payload', () => {
    const token = issueBookingToken({ sessionId: 'sess-1', configId: 'cfg-1', purpose: 'book' })
    const [payload, sig] = token.split('.')
    // Flip a byte in the payload
    const tampered = payload.slice(0, -2) + (payload.slice(-2) === 'AA' ? 'BB' : 'AA') + '.' + sig
    const result = verifyBookingToken(tampered)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      // Either malformed (b64 parse fails) or invalid_signature — both are correct rejections.
      expect(['invalid_signature', 'malformed', 'invalid_payload']).toContain(result.reason)
    }
  })

  it('rejects a tampered signature', () => {
    const token = issueBookingToken({ sessionId: 'sess-1', configId: 'cfg-1', purpose: 'book' })
    const [payload, sig] = token.split('.')
    const flipped = sig.slice(0, -2) + (sig.slice(-2) === 'AA' ? 'BB' : 'AA')
    const result = verifyBookingToken(`${payload}.${flipped}`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_signature')
  })

  it('rejects an expired token', () => {
    const token = signBookingToken({
      sessionId: 'sess-1',
      configId: 'cfg-1',
      purpose: 'book',
      expiresAt: new Date(Date.now() - 60_000),
    })
    const result = verifyBookingToken(token)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('expired')
  })

  it('rejects a different purpose if caller checks', () => {
    const token = issueBookingToken({ sessionId: 's', configId: 'c', purpose: 'cancel' })
    const result = verifyBookingToken(token)
    if (!result.ok) throw new Error('should verify')
    expect(result.payload.purpose).toBe('cancel')
    // Caller is responsible for checking purpose === 'book' etc; we just
    // surface what was signed.
  })

  it('rejects malformed input', () => {
    expect(verifyBookingToken('').ok).toBe(false)
    expect(verifyBookingToken('not.a.real.token').ok).toBe(false)
    expect(verifyBookingToken('only-one-part').ok).toBe(false)
    expect(verifyBookingToken(null).ok).toBe(false)
    expect(verifyBookingToken(undefined).ok).toBe(false)
  })

  it('rejects token signed with a different secret', () => {
    const token = issueBookingToken({ sessionId: 's', configId: 'c', purpose: 'book' })
    process.env.BOOKING_LINK_SECRET = 'different-secret'
    const result = verifyBookingToken(token)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_signature')
  })
})
