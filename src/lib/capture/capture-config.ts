// Capture Engine — typed config for stepType='capture'.
//
// All FlowStep.captureConfig reads go through parseCaptureConfig. The recruiter
// builder edits go through validateCaptureConfig. UI and API code never touch
// the raw JSON column directly — the validator is the contract.

import { z } from 'zod'

export type CaptureMode = 'text' | 'audio' | 'video' | 'audio_video' | 'upload' | 'ai_call'

export const CAPTURE_MODES: readonly CaptureMode[] = [
  'text',
  'audio',
  'video',
  'audio_video',
  'upload',
  'ai_call',
] as const

// Phase 1A ships audio first (and the recorder also supports video and
// audio_video). text/upload are accepted in the config validator so the
// builder can save them, but the candidate-side renderer treats them as
// not-yet-implemented and rejects at upload time.
export const CAPTURE_MODES_PHASE_1A: readonly CaptureMode[] = [
  'audio',
  'video',
  'audio_video',
] as const

// 30 minutes. Beyond this the in-browser MediaRecorder blob gets unwieldy and
// the upload PUT can timeout against the presigned URL. Lift only if the
// upload path moves to multipart.
export const MAX_DURATION_SEC_CEILING = 30 * 60

// Server-side per-mode size ceilings. Independent from the recruiter config
// (which constrains *what the recruiter can configure*) — these guard *what
// the candidate actually sent*. Both layers must pass.
//
// Sized to typical browser-recorded payloads:
//   audio 100 MB ≈ ~3h of opus@128kbps, sane upper bound for any one answer.
//   video 500 MB ≈ ~15min of webm/vp9 at usable quality, fits the 30min
//   MAX_DURATION_SEC_CEILING for low-bitrate captures while rejecting the
//   pathological 4K-from-laptop case.
// Lift only if the upload path moves to multipart S3 PUTs — at these sizes a
// single PUT stays within the presigned URL's wall clock and the Node
// runtime memory budget on the finalize path.
export const MAX_UPLOAD_BYTES_BY_MODE: Record<CaptureMode, number> = {
  text: 0, // text mode does not use the media presign path; rejected up-front
  audio: 100 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  audio_video: 500 * 1024 * 1024,
  upload: 0, // upload mode is reserved for future arbitrary-file capture; rejected up-front
  ai_call: 0, // external provider stores the audio; nothing uploads through HF
}

// Legacy alias for the original single ceiling. Now resolves to the largest
// per-mode limit so callers that don't know the mode can still apply a
// best-effort upper bound. Prefer mode-aware checks in service code.
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(MAX_UPLOAD_BYTES_BY_MODE))

// Modes that are allowed to request a media presign URL in Phase 1A. text /
// upload / ai_call return 400 from the presign route — their pipelines live
// elsewhere (or don't exist yet).
export const MEDIA_PRESIGN_MODES: readonly CaptureMode[] = ['audio', 'video', 'audio_video'] as const

export function isMediaPresignMode(mode: CaptureMode): boolean {
  return MEDIA_PRESIGN_MODES.includes(mode)
}

export function maxUploadBytesFor(mode: CaptureMode): number {
  return MAX_UPLOAD_BYTES_BY_MODE[mode] ?? 0
}

// Allowed MIME types per mode. Browsers vary in what MediaRecorder emits, so
// we accept a small whitelist instead of locking to a single canonical type.
// `audio_video` accepts the video set (the audio is muxed in).
export const ALLOWED_MIME_TYPES: Record<Exclude<CaptureMode, 'text' | 'ai_call'>, readonly string[]> = {
  audio: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a'],
  video: ['video/webm', 'video/mp4', 'video/quicktime'],
  audio_video: ['video/webm', 'video/mp4', 'video/quicktime'],
  upload: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-m4a',
    'video/webm',
    'video/mp4',
    'video/quicktime',
  ],
}

// File extension map for deterministic storage keys. We never trust the
// client-supplied filename; the extension is chosen server-side from the MIME.
export const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// MediaRecorder emits MIMEs with codec params (e.g. `audio/mp4;codecs=opus`,
// `audio/webm;codecs=opus`). Our allowlist + extension map are keyed by the
// bare type only — `bareMime()` strips the suffix so callers don't have to.
// Also normalises case + whitespace.
function bareMime(mimeType: string): string {
  const [base = mimeType] = mimeType.split(';')
  return base.trim().toLowerCase()
}

export function extForMime(mimeType: string): string {
  return MIME_TO_EXT[bareMime(mimeType)] || 'bin'
}

const captureConfigSchema = z
  .object({
    mode: z.enum(['text', 'audio', 'video', 'audio_video', 'upload', 'ai_call']),
    prompt: z.string().max(2000).optional(),
    required: z.boolean().default(true),
    maxDurationSec: z.number().int().positive().max(MAX_DURATION_SEC_CEILING).optional(),
    minDurationSec: z.number().int().nonnegative().max(MAX_DURATION_SEC_CEILING).optional(),
    allowRetake: z.boolean().default(true),
    maxRetakes: z.number().int().positive().max(20).optional(),
    transcriptionEnabled: z.boolean().default(false),
    aiAnalysisEnabled: z.boolean().default(false),
  })
  .superRefine((cfg, ctx) => {
    if (
      cfg.minDurationSec !== undefined &&
      cfg.maxDurationSec !== undefined &&
      cfg.minDurationSec > cfg.maxDurationSec
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'minDurationSec cannot exceed maxDurationSec',
        path: ['minDurationSec'],
      })
    }
    if (cfg.maxRetakes !== undefined && !cfg.allowRetake) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'maxRetakes requires allowRetake=true',
        path: ['maxRetakes'],
      })
    }
  })

export type CaptureConfig = z.infer<typeof captureConfigSchema>

export class CaptureConfigError extends Error {
  readonly issues: string[]
  constructor(message: string, issues: string[] = []) {
    super(message)
    this.name = 'CaptureConfigError'
    this.issues = issues
  }
}

// Parses a CaptureConfig from arbitrary JSON. Throws CaptureConfigError if
// the shape is invalid. Use for trusted reads (e.g. step.captureConfig from
// DB after a write went through validate).
export function parseCaptureConfig(raw: unknown): CaptureConfig {
  const result = captureConfigSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new CaptureConfigError('Invalid capture config', issues)
  }
  return result.data
}

// Same as parseCaptureConfig but returns null on a missing or invalid blob.
// Use for soft reads where the step might predate the feature (older
// FlowStep rows with captureConfig=null).
export function tryParseCaptureConfig(raw: unknown): CaptureConfig | null {
  if (raw == null) return null
  const result = captureConfigSchema.safeParse(raw)
  return result.success ? result.data : null
}

// Recruiter-facing input validator. Stricter messages, surfaces issue list
// to the builder UI. Use at PATCH/POST time before persisting to DB.
export function validateCaptureConfig(input: unknown): {
  ok: true
  value: CaptureConfig
} | {
  ok: false
  errors: string[]
} {
  const result = captureConfigSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`),
    }
  }
  return { ok: true, value: result.data }
}

// Type guard for a FlowStep-shaped object. Anything with stepType='capture'
// AND a parseable captureConfig is a capture step. A step with
// stepType='capture' but null/invalid captureConfig returns false so callers
// can't accidentally treat malformed steps as live capture targets.
export function isCaptureStep(
  step: { stepType: string; captureConfig: unknown } | null | undefined
): step is { stepType: 'capture'; captureConfig: unknown } {
  if (!step) return false
  if (step.stepType !== 'capture') return false
  return tryParseCaptureConfig(step.captureConfig) !== null
}

// Server-side MIME guard. Returns true if the MIME (with or without codec
// params) is in the allowed set for the given capture mode. text/ai_call
// are not file-bearing, so they reject any MIME — those modes don't take
// uploads.
export function isMimeAllowed(mode: CaptureMode, mimeType: string): boolean {
  if (mode === 'text' || mode === 'ai_call') return false
  const allowed = ALLOWED_MIME_TYPES[mode]
  if (!allowed) return false
  return allowed.includes(bareMime(mimeType))
}

// Returns the MIME types Phase 1A accepts for the given mode. Used by the
// candidate UI to constrain MediaRecorder selection and by the presign route
// to short-circuit before doing any DB work.
export function allowedMimesForMode(mode: CaptureMode): readonly string[] {
  if (mode === 'text' || mode === 'ai_call') return []
  return ALLOWED_MIME_TYPES[mode] || []
}
