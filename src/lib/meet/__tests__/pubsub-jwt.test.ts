import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { signArtifactToken, verifyArtifactToken, verifyPubsubJwt } from '../pubsub-jwt'

const ORIGINAL_ENV = { ...process.env }

describe('artifact token sign/verify', () => {
  beforeEach(() => {
    process.env.GOOGLE_DRIVE_RECORDING_SIGNING_SECRET = 'test-secret-for-vitest'
  })
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  it('round-trips a valid token', () => {
    const exp = Math.floor(Date.now() / 1000) + 60
    const tok = signArtifactToken({ meetingId: 'm1', kind: 'recording', exp })
    const decoded = verifyArtifactToken(tok)
    expect(decoded).not.toBeNull()
    expect(decoded!.meetingId).toBe('m1')
    expect(decoded!.kind).toBe('recording')
  })

  it('rejects a tampered token', () => {
    const exp = Math.floor(Date.now() / 1000) + 60
    const tok = signArtifactToken({ meetingId: 'm1', kind: 'recording', exp })
    const [body, mac] = tok.split('.')
    const tamperedBody = Buffer.from(JSON.stringify({ meetingId: 'other', kind: 'recording', exp }), 'utf8').toString('base64url')
    expect(verifyArtifactToken(`${tamperedBody}.${mac}`)).toBeNull()
    expect(verifyArtifactToken(`${body}.AAAA`)).toBeNull()
  })

  it('rejects an expired token', () => {
    const exp = Math.floor(Date.now() / 1000) - 10
    const tok = signArtifactToken({ meetingId: 'm1', kind: 'recording', exp })
    expect(verifyArtifactToken(tok)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(verifyArtifactToken('')).toBeNull()
    expect(verifyArtifactToken('not-a-token')).toBeNull()
    expect(verifyArtifactToken('a.b.c')).toBeNull()
  })

  it('rejects tokens with invalid kind', () => {
    const exp = Math.floor(Date.now() / 1000) + 60
    const secret = 'test-secret-for-vitest'
    const payload = { meetingId: 'm1', kind: 'invalid', exp }
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url')
    expect(verifyArtifactToken(`${body}.${mac}`)).toBeNull()
  })
})

describe('verifyPubsubJwt dev escape hatch', () => {
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  it('returns decoded payload without signature check when allow-unsigned is set', async () => {
    process.env.GOOGLE_MEET_WEBHOOK_ALLOW_UNSIGNED = '1'
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'x' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ iss: 'whatever', aud: 'expected', email: 'a@b' })).toString('base64url')
    const fakeJwt = `${header}.${payload}.AAAA`
    const result = await verifyPubsubJwt(fakeJwt, { expectedAudience: 'expected' })
    expect(result.payload.email).toBe('a@b')
  })
})
