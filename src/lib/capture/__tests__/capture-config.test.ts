import { describe, expect, it } from 'vitest'
import {
  ALLOWED_MIME_TYPES,
  CAPTURE_MODES,
  CAPTURE_MODES_PHASE_1A,
  MAX_DURATION_SEC_CEILING,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES_BY_MODE,
  MEDIA_PRESIGN_MODES,
  allowedMimesForMode,
  extForMime,
  isCaptureStep,
  isMediaPresignMode,
  isMimeAllowed,
  maxUploadBytesFor,
  parseCaptureConfig,
  tryParseCaptureConfig,
  validateCaptureConfig,
} from '../capture-config'

describe('CAPTURE_MODES', () => {
  it('Phase 1A modes are a subset of all modes', () => {
    for (const mode of CAPTURE_MODES_PHASE_1A) {
      expect(CAPTURE_MODES).toContain(mode)
    }
  })
  it('Phase 1A excludes text, upload, ai_call', () => {
    expect(CAPTURE_MODES_PHASE_1A).not.toContain('text' as any)
    expect(CAPTURE_MODES_PHASE_1A).not.toContain('upload' as any)
    expect(CAPTURE_MODES_PHASE_1A).not.toContain('ai_call' as any)
  })
})

describe('validateCaptureConfig — happy path', () => {
  it('accepts a minimal audio config', () => {
    const result = validateCaptureConfig({ mode: 'audio' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.mode).toBe('audio')
      expect(result.value.required).toBe(true)
      expect(result.value.allowRetake).toBe(true)
      expect(result.value.transcriptionEnabled).toBe(false)
      expect(result.value.aiAnalysisEnabled).toBe(false)
    }
  })

  it('accepts a fully-specified config', () => {
    const result = validateCaptureConfig({
      mode: 'video',
      prompt: 'Tell us about yourself',
      required: true,
      maxDurationSec: 120,
      minDurationSec: 5,
      allowRetake: true,
      maxRetakes: 3,
      transcriptionEnabled: true,
      aiAnalysisEnabled: true,
    })
    expect(result.ok).toBe(true)
  })

  it('accepts every defined capture mode', () => {
    for (const mode of CAPTURE_MODES) {
      const result = validateCaptureConfig({ mode })
      expect(result.ok).toBe(true)
    }
  })
})

describe('validateCaptureConfig — rejects invalid input', () => {
  it('rejects unknown mode', () => {
    const result = validateCaptureConfig({ mode: 'screen_recording' })
    expect(result.ok).toBe(false)
  })

  it('rejects missing mode', () => {
    const result = validateCaptureConfig({})
    expect(result.ok).toBe(false)
  })

  it('rejects minDuration > maxDuration', () => {
    const result = validateCaptureConfig({
      mode: 'audio',
      minDurationSec: 120,
      maxDurationSec: 60,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('minDurationSec'))).toBe(true)
    }
  })

  it('rejects maxRetakes without allowRetake', () => {
    const result = validateCaptureConfig({
      mode: 'audio',
      allowRetake: false,
      maxRetakes: 3,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('maxRetakes'))).toBe(true)
    }
  })

  it('rejects negative duration', () => {
    const result = validateCaptureConfig({ mode: 'audio', maxDurationSec: -5 })
    expect(result.ok).toBe(false)
  })

  it('rejects duration above ceiling', () => {
    const result = validateCaptureConfig({
      mode: 'video',
      maxDurationSec: MAX_DURATION_SEC_CEILING + 1,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects oversize prompt', () => {
    const result = validateCaptureConfig({
      mode: 'audio',
      prompt: 'x'.repeat(2001),
    })
    expect(result.ok).toBe(false)
  })
})

describe('parseCaptureConfig vs tryParseCaptureConfig', () => {
  it('parseCaptureConfig throws on invalid', () => {
    expect(() => parseCaptureConfig({ mode: 'screen_recording' })).toThrow()
  })

  it('tryParseCaptureConfig returns null on invalid', () => {
    expect(tryParseCaptureConfig({ mode: 'screen_recording' })).toBeNull()
  })

  it('tryParseCaptureConfig returns null on null input', () => {
    expect(tryParseCaptureConfig(null)).toBeNull()
  })

  it('tryParseCaptureConfig returns null on undefined input', () => {
    expect(tryParseCaptureConfig(undefined)).toBeNull()
  })

  it('parseCaptureConfig returns parsed object on valid input', () => {
    const cfg = parseCaptureConfig({ mode: 'audio_video' })
    expect(cfg.mode).toBe('audio_video')
  })
})

describe('isCaptureStep type guard', () => {
  it('returns true for stepType=capture with valid config', () => {
    expect(isCaptureStep({ stepType: 'capture', captureConfig: { mode: 'audio' } })).toBe(true)
  })

  it('returns false for stepType=capture with null config', () => {
    expect(isCaptureStep({ stepType: 'capture', captureConfig: null })).toBe(false)
  })

  it('returns false for stepType=capture with malformed config', () => {
    expect(isCaptureStep({ stepType: 'capture', captureConfig: { mode: 'banana' } })).toBe(false)
  })

  it('returns false for stepType=question even with valid captureConfig', () => {
    // Defends against legacy rows that happen to have a captureConfig blob —
    // only stepType='capture' counts.
    expect(isCaptureStep({ stepType: 'question', captureConfig: { mode: 'audio' } })).toBe(false)
  })

  it('returns false for null/undefined step', () => {
    expect(isCaptureStep(null)).toBe(false)
    expect(isCaptureStep(undefined)).toBe(false)
  })
})

describe('isMimeAllowed', () => {
  it('accepts audio/webm for audio mode', () => {
    expect(isMimeAllowed('audio', 'audio/webm')).toBe(true)
  })

  it('accepts video/mp4 for audio_video mode', () => {
    expect(isMimeAllowed('audio_video', 'video/mp4')).toBe(true)
  })

  it('rejects video MIME on audio mode', () => {
    expect(isMimeAllowed('audio', 'video/mp4')).toBe(false)
  })

  it('rejects audio MIME on video mode', () => {
    expect(isMimeAllowed('video', 'audio/webm')).toBe(false)
  })

  it('rejects arbitrary types', () => {
    expect(isMimeAllowed('audio', 'application/x-malware')).toBe(false)
    expect(isMimeAllowed('video', 'text/html')).toBe(false)
    expect(isMimeAllowed('upload', 'application/x-shockwave-flash')).toBe(false)
  })

  it('rejects everything for non-file modes', () => {
    expect(isMimeAllowed('text', 'audio/webm')).toBe(false)
    expect(isMimeAllowed('ai_call', 'audio/webm')).toBe(false)
  })

  it('is case-insensitive on MIME', () => {
    expect(isMimeAllowed('audio', 'AUDIO/WEBM')).toBe(true)
  })

  it('accepts codec-suffixed MIMEs (real MediaRecorder output)', () => {
    // Regression: real production bug — MediaRecorder emits
    // `audio/mp4;codecs=opus` and `audio/webm;codecs=opus`. The presign
    // route called isMimeAllowed against these strings and rejected them
    // with mime_not_allowed (400) before this fix.
    expect(isMimeAllowed('audio', 'audio/mp4;codecs=opus')).toBe(true)
    expect(isMimeAllowed('audio', 'audio/webm;codecs=opus')).toBe(true)
    expect(isMimeAllowed('video', 'video/webm;codecs=vp9,opus')).toBe(true)
    expect(isMimeAllowed('audio_video', 'video/mp4;codecs=h264,opus')).toBe(true)
  })

  it('tolerates whitespace around codec params', () => {
    expect(isMimeAllowed('audio', '  audio/webm  ; codecs=opus')).toBe(true)
  })

  it('allowedMimesForMode returns the same set isMimeAllowed accepts', () => {
    for (const mode of ['audio', 'video', 'audio_video', 'upload'] as const) {
      for (const mime of allowedMimesForMode(mode)) {
        expect(isMimeAllowed(mode, mime)).toBe(true)
      }
    }
  })
})

describe('extForMime', () => {
  it('maps common MIMEs to canonical extensions', () => {
    expect(extForMime('audio/webm')).toBe('webm')
    expect(extForMime('audio/mp4')).toBe('m4a')
    expect(extForMime('video/mp4')).toBe('mp4')
    expect(extForMime('video/quicktime')).toBe('mov')
    expect(extForMime('application/pdf')).toBe('pdf')
  })

  it('returns "bin" for unknown MIMEs', () => {
    // Important: never trust an unknown MIME to pick a fancy extension. The
    // safer fallback is a generic bin so the storage key stays predictable.
    expect(extForMime('application/x-novel-format')).toBe('bin')
  })

  it('handles uppercase MIMEs', () => {
    expect(extForMime('AUDIO/WEBM')).toBe('webm')
  })

  it('strips codec params (real MediaRecorder output)', () => {
    expect(extForMime('audio/mp4;codecs=opus')).toBe('m4a')
    expect(extForMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extForMime('video/webm;codecs=vp9,opus')).toBe('webm')
  })
})

describe('size + duration ceilings', () => {
  it('MAX_DURATION_SEC_CEILING is 30 minutes', () => {
    expect(MAX_DURATION_SEC_CEILING).toBe(30 * 60)
  })

  it('MAX_UPLOAD_BYTES is the largest per-mode ceiling', () => {
    expect(MAX_UPLOAD_BYTES).toBe(Math.max(...Object.values(MAX_UPLOAD_BYTES_BY_MODE)))
  })
})

describe('per-mode upload limits', () => {
  it('audio cap is 100MB', () => {
    expect(maxUploadBytesFor('audio')).toBe(100 * 1024 * 1024)
  })

  it('video cap is 500MB', () => {
    expect(maxUploadBytesFor('video')).toBe(500 * 1024 * 1024)
  })

  it('audio_video cap is 500MB (treated as video)', () => {
    expect(maxUploadBytesFor('audio_video')).toBe(500 * 1024 * 1024)
  })

  it('text/upload/ai_call have zero media cap', () => {
    expect(maxUploadBytesFor('text')).toBe(0)
    expect(maxUploadBytesFor('upload')).toBe(0)
    expect(maxUploadBytesFor('ai_call')).toBe(0)
  })
})

describe('media presign gate', () => {
  it('audio/video/audio_video are allowed on the media presign path', () => {
    expect(isMediaPresignMode('audio')).toBe(true)
    expect(isMediaPresignMode('video')).toBe(true)
    expect(isMediaPresignMode('audio_video')).toBe(true)
  })

  it('text/upload/ai_call are rejected from the media presign path', () => {
    expect(isMediaPresignMode('text')).toBe(false)
    expect(isMediaPresignMode('upload')).toBe(false)
    expect(isMediaPresignMode('ai_call')).toBe(false)
  })

  it('MEDIA_PRESIGN_MODES equals the Phase 1A set', () => {
    expect([...MEDIA_PRESIGN_MODES].sort()).toEqual([...CAPTURE_MODES_PHASE_1A].sort())
  })
})

describe('ALLOWED_MIME_TYPES — invariants', () => {
  it('upload mode is a superset of audio and video MIMEs', () => {
    for (const m of ALLOWED_MIME_TYPES.audio) {
      expect(ALLOWED_MIME_TYPES.upload).toContain(m)
    }
    for (const m of ALLOWED_MIME_TYPES.video) {
      expect(ALLOWED_MIME_TYPES.upload).toContain(m)
    }
  })

  it('audio_video uses video MIME set', () => {
    expect(ALLOWED_MIME_TYPES.audio_video).toEqual(ALLOWED_MIME_TYPES.video)
  })
})
