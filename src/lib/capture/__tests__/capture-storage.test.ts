import { describe, expect, it } from 'vitest'
import {
  buildCaptureStorageKey,
  parseCaptureStorageKey,
  validateUploadSize,
  validateUploadSizeForMode,
} from '../capture-storage.service'

describe('buildCaptureStorageKey', () => {
  it('produces the tenant-scoped layout', () => {
    const key = buildCaptureStorageKey({
      workspaceId: 'ws_123',
      sessionId: 'ses_456',
      stepId: 'step_789',
      captureResponseId: 'cap_abc',
      mimeType: 'audio/webm',
    })
    expect(key).toBe('captures/ws_123/ses_456/step_789/cap_abc.webm')
  })

  it('picks extension from MIME deterministically', () => {
    const key = buildCaptureStorageKey({
      workspaceId: 'w', sessionId: 's', stepId: 'st', captureResponseId: 'c',
      mimeType: 'video/mp4',
    })
    expect(key.endsWith('.mp4')).toBe(true)
  })

  it('falls back to .bin for unknown MIME', () => {
    const key = buildCaptureStorageKey({
      workspaceId: 'w', sessionId: 's', stepId: 'st', captureResponseId: 'c',
      mimeType: 'application/x-unknown',
    })
    expect(key.endsWith('.bin')).toBe(true)
  })

  it('rejects empty id parts', () => {
    expect(() =>
      buildCaptureStorageKey({
        workspaceId: '',
        sessionId: 's',
        stepId: 'st',
        captureResponseId: 'c',
        mimeType: 'audio/webm',
      })
    ).toThrow(/workspaceId/)
  })

  it('rejects path-traversal characters in ids', () => {
    // If anyone ever lets user input flow into one of these ids, the key
    // generator must refuse. Slash/backslash/dot-dot all denied.
    for (const bad of ['..', 'a/b', 'a\\b', '../escape']) {
      expect(() =>
        buildCaptureStorageKey({
          workspaceId: bad,
          sessionId: 's',
          stepId: 'st',
          captureResponseId: 'c',
          mimeType: 'audio/webm',
        })
      ).toThrow()
    }
  })

  it('the same inputs produce the same key (deterministic)', () => {
    const a = buildCaptureStorageKey({
      workspaceId: 'w', sessionId: 's', stepId: 'st', captureResponseId: 'c',
      mimeType: 'audio/webm',
    })
    const b = buildCaptureStorageKey({
      workspaceId: 'w', sessionId: 's', stepId: 'st', captureResponseId: 'c',
      mimeType: 'audio/webm',
    })
    expect(a).toBe(b)
  })
})

describe('parseCaptureStorageKey', () => {
  it('round-trips with buildCaptureStorageKey', () => {
    const built = buildCaptureStorageKey({
      workspaceId: 'ws1',
      sessionId: 'sess1',
      stepId: 'step1',
      captureResponseId: 'cap1',
      mimeType: 'video/webm',
    })
    const parsed = parseCaptureStorageKey(built)
    expect(parsed).toEqual({
      workspaceId: 'ws1',
      sessionId: 'sess1',
      stepId: 'step1',
      captureResponseId: 'cap1',
    })
  })

  it('returns null for a non-capture prefix', () => {
    expect(parseCaptureStorageKey('candidates/foo.webm')).toBeNull()
    expect(parseCaptureStorageKey('something/else/entirely.mp4')).toBeNull()
  })

  it('returns null for malformed depth', () => {
    expect(parseCaptureStorageKey('captures/ws/sess/cap.webm')).toBeNull()
    expect(parseCaptureStorageKey('captures/ws/sess/step/cap/extra.webm')).toBeNull()
  })

  it('returns null when filename has no extension', () => {
    expect(parseCaptureStorageKey('captures/ws/sess/step/cap')).toBeNull()
  })
})

describe('validateUploadSize', () => {
  it('accepts a normal-size upload', () => {
    expect(validateUploadSize(5 * 1024 * 1024, 100 * 1024 * 1024)).toEqual({ ok: true })
  })

  it('rejects undefined content length', () => {
    const r = validateUploadSize(undefined, 100)
    expect(r.ok).toBe(false)
  })

  it('rejects zero or negative size', () => {
    const r0 = validateUploadSize(0, 100)
    expect(r0.ok).toBe(false)
    const rNeg = validateUploadSize(-5, 100)
    expect(rNeg.ok).toBe(false)
  })

  it('rejects size at exactly limit + 1', () => {
    const r = validateUploadSize(101, 100)
    expect(r.ok).toBe(false)
  })

  it('accepts exactly the limit', () => {
    const r = validateUploadSize(100, 100)
    expect(r.ok).toBe(true)
  })
})

describe('validateUploadSizeForMode', () => {
  it('accepts a 50MB audio upload', () => {
    const r = validateUploadSizeForMode(50 * 1024 * 1024, 'audio')
    expect(r.ok).toBe(true)
  })

  it('rejects a 200MB audio upload (over 100MB cap)', () => {
    const r = validateUploadSizeForMode(200 * 1024 * 1024, 'audio')
    expect(r.ok).toBe(false)
  })

  it('accepts a 400MB video upload', () => {
    const r = validateUploadSizeForMode(400 * 1024 * 1024, 'video')
    expect(r.ok).toBe(true)
  })

  it('rejects a 600MB video upload (over 500MB cap)', () => {
    const r = validateUploadSizeForMode(600 * 1024 * 1024, 'video')
    expect(r.ok).toBe(false)
  })

  it('rejects text mode outright (zero cap = no media)', () => {
    const r = validateUploadSizeForMode(1, 'text')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toMatch(/does not accept media uploads/)
    }
  })

  it('rejects upload mode outright in Phase 1A', () => {
    const r = validateUploadSizeForMode(1, 'upload')
    expect(r.ok).toBe(false)
  })

  it('rejects ai_call mode outright', () => {
    const r = validateUploadSizeForMode(1, 'ai_call')
    expect(r.ok).toBe(false)
  })
})
