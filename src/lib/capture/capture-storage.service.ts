// Capture Engine — storage boundary.
//
// All storage keys are server-generated and tenant-scoped:
//   captures/{workspaceId}/{sessionId}/{stepId}/{captureResponseId}.{ext}
//
// The client never proposes a key. The candidate-side flow asks the server
// for a presigned upload URL keyed off (sessionId, stepId, mode, mimeType);
// the server picks the CaptureResponse id, builds the key, signs the PUT,
// and returns both to the client.
//
// ─────────────────────────────────────────────────────────────────────
// TODO(resumable-upload): Phase 1F (video) requires a resumable upload
// architecture. Audio caps at 100 MB and a single PUT against a presigned
// URL works reliably for that envelope. Video caps at 500 MB and a single
// PUT is brittle on flaky mobile networks — Safari particularly drops the
// connection on long PUTs.
//
// Planned approach for video:
//   1. Replace single PUT with S3 multipart upload (CreateMultipartUpload
//      → UploadPart * N → CompleteMultipartUpload). Each part is 5-10 MB.
//      Presign each part URL on demand from a `/presign-part` endpoint
//      keyed by (captureId, partNumber); the server tracks etags as parts
//      complete and finalizes the multipart upload server-side.
//   2. Client-side chunking: slice the Blob into part-sized chunks,
//      uploadPart each in sequence (or with bounded parallelism). Retry
//      individual failed parts up to N times before failing the whole
//      capture — single-part failures should not kill the upload.
//   3. Resume on reload: persist the captureId + uploaded part numbers in
//      sessionStorage so a tab refresh mid-upload can pick up where it
//      left off (presign the remaining parts and continue).
//   4. Background sync (progressive enhancement): on networks where
//      navigator.serviceWorker is available, register a Background Sync
//      task so the upload can complete even if the candidate navigates
//      away or backgrounds the tab on mobile.
//   5. Abort cleanup: AbortMultipartUpload on user-initiated cancel +
//      orphan-cleanup cron picks up any aborted multipart uploads that
//      didn't trigger the client-side abort (network drop, browser quit).
// ─────────────────────────────────────────────────────────────────────
// TODO(s3-lifecycle): the captures S3 bucket should have these Lifecycle
// Configuration rules attached server-side (Terraform / AWS CLI) so we
// don't rely solely on the in-app orphan cron. Recommended rules — set
// once at the bucket level by ops:
//
//   1. AbortIncompleteMultipartUpload after 24 hours.
//      Filter: prefix = "captures/"
//      Backstop for the multipart pipeline once Phase 1F lands. Without
//      it, an aborted multipart upload sits in the bucket consuming
//      storage with no listable object.
//
//   2. Expiration on the `failed-cleanup/` prefix after 30 days.
//      Filter: prefix = "captures/failed-cleanup/"
//      When the orphan-cleanup cron marks an object for deletion it
//      moves it to this prefix first (audit window). Lifecycle does
//      the actual delete.
//
//   3. NoncurrentVersionExpiration after 30 days IF bucket versioning
//      is enabled. (Versioning isn't enabled today, but if ops turns
//      it on for compliance later, this rule prevents indefinite
//      retention of overwritten objects.)
//
//   4. Transition to S3 Standard-IA after 90 days, Glacier IR after
//      365 days. Optional — only useful if recruiters routinely
//      revisit recordings >3 months old (TBD per workspace).
//
// Document any changes in Obsidian/Projects/HireFunnel.md so the next
// runbook update has the current state.
// ─────────────────────────────────────────────────────────────────────

import {
  getUploadPresignedUrl as s3GetUploadPresignedUrl,
  getDownloadPresignedUrl as s3GetDownloadPresignedUrl,
  headObject as s3HeadObject,
} from '@/lib/s3'
import { extForMime, maxUploadBytesFor, type CaptureMode } from './capture-config'

const STORAGE_PROVIDER_S3 = 's3' as const
export const CAPTURE_STORAGE_PROVIDER = STORAGE_PROVIDER_S3

// Deterministic, tenant-scoped key. Refuses to build a key for IDs that
// contain path-traversal characters — we trust them since they're UUIDs in
// practice, but the guard is cheap and prevents future misuse.
export function buildCaptureStorageKey(parts: {
  workspaceId: string
  sessionId: string
  stepId: string
  captureResponseId: string
  mimeType: string
}): string {
  const { workspaceId, sessionId, stepId, captureResponseId, mimeType } = parts
  for (const [name, value] of Object.entries({ workspaceId, sessionId, stepId, captureResponseId })) {
    if (!value || typeof value !== 'string') {
      throw new Error(`buildCaptureStorageKey: ${name} is empty`)
    }
    if (value.includes('/') || value.includes('..') || value.includes('\\')) {
      throw new Error(`buildCaptureStorageKey: ${name} contains illegal path characters`)
    }
  }
  const ext = extForMime(mimeType)
  return `captures/${workspaceId}/${sessionId}/${stepId}/${captureResponseId}.${ext}`
}

// Parses a key back into its tenant scope. Used by the playback route as a
// belt-and-braces ownership check after we've already matched the
// CaptureResponse row's workspaceId. Returns null on any unexpected shape.
export function parseCaptureStorageKey(key: string): {
  workspaceId: string
  sessionId: string
  stepId: string
  captureResponseId: string
} | null {
  const parts = key.split('/')
  if (parts.length !== 5 || parts[0] !== 'captures') return null
  const filename = parts[4]
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return null
  const captureResponseId = filename.slice(0, dot)
  return {
    workspaceId: parts[1],
    sessionId: parts[2],
    stepId: parts[3],
    captureResponseId,
  }
}

// Phase 1A: presigned PUT for direct browser-to-S3 upload. Caller is
// responsible for validating MIME and mode beforehand — this layer just signs.
export async function presignCaptureUpload(opts: {
  key: string
  mimeType: string
  expiresInSec?: number
}): Promise<{ url: string; expiresAt: Date }> {
  const expiresIn = opts.expiresInSec ?? 900 // 15 min — short enough that a stolen URL is useless soon, long enough for a slow upload
  const url = await s3GetUploadPresignedUrl(opts.key, opts.mimeType)
  return {
    url,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  }
}

// Hard upper bound on playback URL lifetime. Recruiter UI must never hold a
// signed URL longer than this. Any caller passing a larger expiresInSec is
// clamped down silently — the URL is the credential, so the rule is
// "default short, never long".
export const PLAYBACK_MAX_EXPIRES_SEC = 300

// Short-lived signed GET for recruiter playback. Default 5 minutes, capped at
// PLAYBACK_MAX_EXPIRES_SEC so a buggy caller can't request a 1-hour URL. The
// playback API route mints fresh URLs on every request and sets Cache-Control
// no-store so neither browsers nor proxies cache them.
export async function presignCapturePlayback(opts: {
  key: string
  mimeType?: string
  expiresInSec?: number
}): Promise<{ url: string; expiresAt: Date }> {
  const requested = opts.expiresInSec ?? PLAYBACK_MAX_EXPIRES_SEC
  const expiresIn = Math.max(1, Math.min(requested, PLAYBACK_MAX_EXPIRES_SEC))
  const url = await s3GetDownloadPresignedUrl(opts.key, {
    expiresInSec: expiresIn,
    responseContentType: opts.mimeType,
  })
  return {
    url,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  }
}

// HEAD against the object so the finalize route can confirm the upload
// actually landed. Returns null if missing — callers should treat that as
// "the candidate never finished the PUT" and keep status='uploading'.
export async function inspectUploadedObject(key: string): Promise<{
  contentType?: string
  contentLength?: number
  etag?: string
} | null> {
  return s3HeadObject(key)
}

// Sanity check on the upload size against an explicit ceiling. The presign
// route can't enforce size on its own (S3 presigned PUT URLs don't enforce
// content-length without a separate policy doc), so the finalize route
// relies on this check post-upload using the per-mode limit.
export function validateUploadSize(
  contentLength: number | undefined,
  ceiling: number
): { ok: true } | { ok: false; reason: string } {
  if (contentLength == null) {
    return { ok: false, reason: 'Upload size unknown (S3 HEAD returned no content-length)' }
  }
  if (contentLength <= 0) {
    return { ok: false, reason: 'Upload is empty' }
  }
  if (contentLength > ceiling) {
    return { ok: false, reason: `Upload size ${contentLength} bytes exceeds limit ${ceiling}` }
  }
  return { ok: true }
}

// Mode-aware variant. Use from finalize / presign so the limit reflects the
// capture mode rather than the global max.
export function validateUploadSizeForMode(
  contentLength: number | undefined,
  mode: CaptureMode
): { ok: true } | { ok: false; reason: string } {
  const ceiling = maxUploadBytesFor(mode)
  if (ceiling <= 0) {
    return { ok: false, reason: `Mode '${mode}' does not accept media uploads` }
  }
  return validateUploadSize(contentLength, ceiling)
}

export function isMediaMode(mode: CaptureMode): boolean {
  return mode === 'audio' || mode === 'video' || mode === 'audio_video' || mode === 'upload'
}
