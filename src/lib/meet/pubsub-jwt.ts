/**
 * Pub/Sub push JWT verification.
 *
 * Google Pub/Sub push subscriptions can be configured to attach an OIDC token
 * to every push, signed by Google. We verify:
 *   1. The token signature against Google's JWKS.
 *   2. `aud` matches the expected audience (the push endpoint URL).
 *   3. `email` matches the expected service account (if configured).
 *   4. `iss` is https://accounts.google.com.
 *   5. Expiry.
 *
 * If GOOGLE_MEET_WEBHOOK_ALLOW_UNSIGNED=1 (dev only), verification is skipped.
 * In production the shared-token query param is the first line of defense and
 * this JWT check is the second.
 */

import crypto from 'crypto'

interface JwtHeader { alg: string; kid: string; typ?: string }
interface JwtPayload {
  iss?: string
  aud?: string | string[]
  email?: string
  email_verified?: boolean
  exp?: number
  iat?: number
  sub?: string
}

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com']

interface JwkCacheEntry {
  fetchedAt: number
  keys: Record<string, crypto.KeyObject>
}

let jwkCache: JwkCacheEntry | null = null
const JWK_TTL_MS = 60 * 60 * 1000 // 1h

async function getJwks(): Promise<Record<string, crypto.KeyObject>> {
  if (jwkCache && Date.now() - jwkCache.fetchedAt < JWK_TTL_MS) return jwkCache.keys
  const res = await fetch(GOOGLE_JWKS_URL)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
  const body = await res.json() as { keys: Array<{ kid: string; n: string; e: string; kty: string; alg?: string }> }
  const keys: Record<string, crypto.KeyObject> = {}
  for (const k of body.keys) {
    if (k.kty !== 'RSA') continue
    const jwk = { kty: k.kty, n: k.n, e: k.e }
    keys[k.kid] = crypto.createPublicKey({ key: jwk, format: 'jwk' })
  }
  jwkCache = { fetchedAt: Date.now(), keys }
  return keys
}

function base64UrlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export interface VerifyOptions {
  expectedAudience: string
  expectedEmail?: string   // service account email configured on the push subscription
}

export interface VerifiedJwt {
  payload: JwtPayload
  header: JwtHeader
}

/**
 * Verify a Google-signed OIDC token. Throws on any failure. In dev, if
 * GOOGLE_MEET_WEBHOOK_ALLOW_UNSIGNED=1, returns a stub without verification.
 */
export async function verifyPubsubJwt(token: string, opts: VerifyOptions): Promise<VerifiedJwt> {
  if (process.env.GOOGLE_MEET_WEBHOOK_ALLOW_UNSIGNED === '1') {
    // Dev escape hatch — still decode so payload/headers are available.
    const [h, p] = token.split('.')
    return {
      header: JSON.parse(base64UrlDecode(h).toString('utf8')),
      payload: JSON.parse(base64UrlDecode(p).toString('utf8')),
    }
  }

  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed JWT')
  const [headerB64, payloadB64, sigB64] = parts
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as JwtHeader
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as JwtPayload

  if (header.alg !== 'RS256') throw new Error(`Unsupported alg: ${header.alg}`)
  const jwks = await getJwks()
  const key = jwks[header.kid]
  if (!key) throw new Error(`Unknown kid: ${header.kid}`)

  const signedInput = `${headerB64}.${payloadB64}`
  const sig = base64UrlDecode(sigB64)
  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(signedInput)
  verifier.end()
  if (!verifier.verify(key, sig)) throw new Error('Invalid signature')

  const now = Math.floor(Date.now() / 1000)
  if (!payload.exp || payload.exp < now - 30) throw new Error('Token expired')
  if (!payload.iss || !GOOGLE_ISS.includes(payload.iss)) throw new Error(`Bad issuer: ${payload.iss}`)

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud ?? '']
  if (!aud.includes(opts.expectedAudience)) {
    throw new Error(`Bad audience: ${aud.join(',')}, expected ${opts.expectedAudience}`)
  }

  if (opts.expectedEmail) {
    if (payload.email !== opts.expectedEmail) throw new Error(`Bad email: ${payload.email}`)
    if (payload.email_verified !== true) throw new Error('Email not verified')
  }

  return { header, payload }
}

/**
 * Used to sign short-lived artifact proxy URLs. Not related to Google's JWT —
 * this is a local HMAC used by /api/interview-meetings/[id]/recording.
 */
export function signArtifactToken(payload: { meetingId: string; kind: 'recording' | 'transcript'; exp: number }): string {
  const secret = process.env.GOOGLE_DRIVE_RECORDING_SIGNING_SECRET
    || process.env.TOKEN_ENCRYPTION_KEY
    || process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('GOOGLE_DRIVE_RECORDING_SIGNING_SECRET or NEXTAUTH_SECRET required')
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function verifyArtifactToken(token: string): { meetingId: string; kind: 'recording' | 'transcript'; exp: number } | null {
  const secret = process.env.GOOGLE_DRIVE_RECORDING_SIGNING_SECRET
    || process.env.TOKEN_ENCRYPTION_KEY
    || process.env.NEXTAUTH_SECRET
  if (!secret) return null
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  // Constant-time compare
  if (mac.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null
    if (payload.kind !== 'recording' && payload.kind !== 'transcript') return null
    if (typeof payload.meetingId !== 'string') return null
    return payload
  } catch {
    return null
  }
}
