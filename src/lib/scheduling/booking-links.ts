/**
 * Stateless signed tokens for the public candidate-facing booking flow.
 *
 * Format: base64url(JSON({ s, c, p, e })) + '.' + base64url(HMAC-SHA256(payload))
 *   s = sessionId
 *   c = configId
 *   p = purpose ('book' | 'reschedule' | 'cancel')
 *   e = expiresAt (unix seconds)
 *
 * Why HMAC + JSON instead of JWT: avoids a new dep; we control both ends and
 * don't need JWS algorithm flexibility. Why not encrypt: the contents are
 * non-secret IDs; tamper-detection is the only requirement.
 *
 * Secret resolution falls back to NEXTAUTH_SECRET so existing dev/staging
 * environments work without a new env var. Set BOOKING_LINK_SECRET in prod
 * to rotate independently of NextAuth.
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto'

export type BookingTokenPurpose = 'book' | 'reschedule' | 'cancel'

export interface BookingTokenPayload {
  sessionId: string
  configId: string
  purpose: BookingTokenPurpose
  expiresAt: Date
}

interface SerializedPayload {
  s: string
  c: string
  p: BookingTokenPurpose
  e: number
}

function getSecret(): Buffer {
  const secret = process.env.BOOKING_LINK_SECRET || process.env.NEXTAUTH_SECRET || ''
  if (!secret) {
    throw new Error('BOOKING_LINK_SECRET or NEXTAUTH_SECRET required to sign booking links')
  }
  // Stretch via SHA-256 so a short NextAuth secret still produces a 32-byte
  // HMAC key. Same pattern as src/lib/crypto.ts getKey().
  return createHash('sha256').update(secret).digest()
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export function signBookingToken(payload: BookingTokenPayload): string {
  const serialized: SerializedPayload = {
    s: payload.sessionId,
    c: payload.configId,
    p: payload.purpose,
    e: Math.floor(payload.expiresAt.getTime() / 1000),
  }
  const payloadB64 = base64url(Buffer.from(JSON.stringify(serialized), 'utf8'))
  const sigB64 = base64url(createHmac('sha256', getSecret()).update(payloadB64).digest())
  return `${payloadB64}.${sigB64}`
}

export interface VerifyResult {
  ok: true
  payload: BookingTokenPayload
}
export interface VerifyFailure {
  ok: false
  reason: 'malformed' | 'invalid_signature' | 'expired' | 'invalid_payload'
}

export function verifyBookingToken(token: string | null | undefined): VerifyResult | VerifyFailure {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [payloadB64, sigB64] = parts

  // Constant-time signature compare to defeat timing oracles. Both buffers
  // must be the same length for timingSafeEqual not to throw, so we early-
  // out on length mismatch (which itself is not constant-time, but a length
  // difference is not a meaningful timing leak — every honest token is
  // exactly 43 bytes once base64url-decoded).
  let expectedSig: Buffer
  try {
    expectedSig = createHmac('sha256', getSecret()).update(payloadB64).digest()
  } catch {
    return { ok: false, reason: 'invalid_signature' }
  }
  let givenSig: Buffer
  try {
    givenSig = fromBase64url(sigB64)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (givenSig.length !== expectedSig.length) {
    return { ok: false, reason: 'invalid_signature' }
  }
  if (!timingSafeEqual(givenSig, expectedSig)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  let parsed: SerializedPayload
  try {
    parsed = JSON.parse(fromBase64url(payloadB64).toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (
    typeof parsed !== 'object' || parsed === null ||
    typeof parsed.s !== 'string' ||
    typeof parsed.c !== 'string' ||
    typeof parsed.e !== 'number' ||
    (parsed.p !== 'book' && parsed.p !== 'reschedule' && parsed.p !== 'cancel')
  ) {
    return { ok: false, reason: 'invalid_payload' }
  }

  const expiresAt = new Date(parsed.e * 1000)
  if (expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    payload: {
      sessionId: parsed.s,
      configId: parsed.c,
      purpose: parsed.p,
      expiresAt,
    },
  }
}

/**
 * Convenience: build a token expiring `daysFromNow` days from now. Most
 * callers want this rather than constructing the Date themselves.
 */
export function issueBookingToken(opts: {
  sessionId: string
  configId: string
  purpose: BookingTokenPurpose
  daysFromNow?: number
  expiresAt?: Date
}): string {
  const expiresAt = opts.expiresAt ?? new Date(Date.now() + (opts.daysFromNow ?? 30) * 24 * 60 * 60 * 1000)
  return signBookingToken({
    sessionId: opts.sessionId,
    configId: opts.configId,
    purpose: opts.purpose,
    expiresAt,
  })
}
