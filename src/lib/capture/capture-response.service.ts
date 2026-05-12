// Capture Engine — domain layer for CaptureResponse rows.
//
// The two public APIs (presign and finalize) and the recruiter list/playback
// routes go through this module so the status machine and ownership rules
// live in one place.
//
// Status machine:
//   draft → uploading → uploaded → processing → processed
//   failed is terminal and reachable from uploading or processing.
//
// Phase 1A skips the processing stage: a successful finalize transitions
// uploading → uploaded → processed in a single transaction (no transcription
// or AI analysis yet). The status field still exists so the recruiter UI can
// distinguish "candidate is mid-upload" from "ready to play", and Phase 1B
// can slot transcription/AI in between without changing the row shape.
//
// ─────────────────────────────────────────────────────────────────────
// Deferred work (tracked in code so future contributors find it):
//
// TODO(orphan-cleanup-cron): a future cron in src/app/api/cron/capture-cleanup
// should sweep three buckets, all hard-deleted (no audit value once the DB
// row is gone):
//   1) `draft` + `uploading` CaptureResponse rows older than 24h. The
//      candidate abandoned the presign before finalize (closed the tab,
//      network died, decided not to apply). DELETE the row; if a storageKey
//      exists also DELETE the S3 object — though most of these never
//      received a PUT.
//   2) `failed` rows older than 30d. Audit window long enough for support
//      requests. DELETE row + S3 object.
//   3) Orphan S3 objects under captures/{workspaceId}/* whose key has no
//      matching CaptureResponse row. Happens when the candidate's PUT
//      succeeds but finalize never runs (network drop, page closed before
//      the POST). The bytes sit in S3 forever otherwise. Use ListObjectsV2
//      paginated by workspace prefix, join against the DB key set, DELETE
//      the orphans.
//
// TODO(multipart-upload): once Phase 1F ships video / audio_video, the
// finalize path's MAX_UPLOAD_BYTES_BY_MODE rises to 500 MB. A single PUT
// to S3 has a 5 GB hard ceiling but the candidate's browser will struggle
// with anything past ~200 MB in one shot — Safari especially has been
// observed to drop the connection. Switch the upload path to S3 multipart
// uploads (createMultipartUpload + uploadPart + completeMultipartUpload)
// when introducing video.
//
// Not in Phase 1 scope. See schema.prisma model header for the equivalent
// schema-side note.
// ─────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import type { CaptureResponse, FlowStep, Session } from '@prisma/client'
import {
  parseCaptureConfig,
  isCaptureStep,
  isMimeAllowed,
  isMediaPresignMode,
  CAPTURE_MODES_PHASE_1A,
  type CaptureConfig,
  type CaptureMode,
} from './capture-config'
import {
  buildCaptureStorageKey,
  CAPTURE_STORAGE_PROVIDER,
} from './capture-storage.service'

// App-layer guards. These complement the DB-level constraints with explicit
// preconditions so bad inputs fail fast with a clear message instead of
// crashing on a Postgres error string. Each guard throws CaptureError on
// failure; callers should let it propagate to the API layer for the right
// HTTP status.
function assertFieldGuards(opts: {
  captureOrdinal?: number
  durationSec?: number | null
  fileSizeBytes?: number | null
}): void {
  if (opts.captureOrdinal !== undefined && (!Number.isFinite(opts.captureOrdinal) || opts.captureOrdinal < 1)) {
    throw new CaptureError('invalid_transition', `captureOrdinal must be >= 1 (got ${opts.captureOrdinal})`, 400)
  }
  if (opts.durationSec != null && (!Number.isFinite(opts.durationSec) || opts.durationSec < 0)) {
    throw new CaptureError('invalid_transition', `durationSec must be >= 0 (got ${opts.durationSec})`, 400)
  }
  if (opts.fileSizeBytes != null && (!Number.isFinite(opts.fileSizeBytes) || opts.fileSizeBytes < 0)) {
    throw new CaptureError('invalid_transition', `fileSizeBytes must be >= 0 (got ${opts.fileSizeBytes})`, 400)
  }
}

export type CaptureStatus =
  | 'draft'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'processed'
  | 'failed'

export const CAPTURE_STATUSES: readonly CaptureStatus[] = [
  'draft',
  'uploading',
  'uploaded',
  'processing',
  'processed',
  'failed',
]

// Forward edges in the status machine. failed is terminal — once a row hits
// failed, the candidate must create a new response (retake) instead of
// patching the failed one forward. This keeps the audit trail honest about
// which take actually succeeded.
const ALLOWED_TRANSITIONS: Record<CaptureStatus, readonly CaptureStatus[]> = {
  draft: ['uploading', 'failed'],
  uploading: ['uploaded', 'failed'],
  uploaded: ['processing', 'processed', 'failed'],
  processing: ['processed', 'failed'],
  processed: [],
  failed: [],
}

export function canTransition(from: CaptureStatus, to: CaptureStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export class CaptureError extends Error {
  readonly code:
    | 'session_not_found'
    | 'session_finished'
    | 'step_not_found'
    | 'step_not_in_flow'
    | 'not_capture_step'
    | 'mode_not_supported_phase'
    | 'mime_not_allowed'
    | 'retake_not_allowed'
    | 'max_retakes_exceeded'
    | 'capture_not_found'
    | 'forbidden_workspace'
    | 'invalid_transition'
  readonly status: number
  constructor(
    code: CaptureError['code'],
    message: string,
    status = 400
  ) {
    super(message)
    this.name = 'CaptureError'
    this.code = code
    this.status = status
  }
}

// Loads the (session, step) pair and verifies they belong to the same flow.
// Throws CaptureError on any failure so callers can branch on .code/.status.
export async function loadCaptureContext(opts: {
  sessionId: string
  stepId: string
}): Promise<{
  session: Session
  step: FlowStep
  config: CaptureConfig
}> {
  const { sessionId, stepId } = opts
  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new CaptureError('session_not_found', 'Session not found', 404)
  if (session.finishedAt) {
    // Finished sessions can't accept new captures. Recruiter UI lists prior
    // captures via the list route, not this path.
    throw new CaptureError('session_finished', 'Session is finished', 400)
  }
  const step = await prisma.flowStep.findUnique({ where: { id: stepId } })
  if (!step) throw new CaptureError('step_not_found', 'Step not found', 404)
  if (step.flowId !== session.flowId) {
    // Belt-and-braces: a candidate could craft a request pointing at a step
    // from another flow they happen to have a session for. The DB doesn't
    // enforce step→session-flow alignment, so we do.
    throw new CaptureError('step_not_in_flow', 'Step does not belong to this session\'s flow', 403)
  }
  if (!isCaptureStep(step)) {
    throw new CaptureError('not_capture_step', 'Step is not a capture step', 400)
  }
  const config = parseCaptureConfig(step.captureConfig)
  return { session, step, config }
}

// Retake policy: returns the highest captureOrdinal currently in use for the
// (session, step) pair, plus the next ordinal to assign. If allowRetake is
// off, only one capture is permitted (and the next call would exceed). If
// maxRetakes is set, the total takes (initial + retakes) is capped.
async function nextOrdinalFor(opts: {
  sessionId: string
  stepId: string
  config: CaptureConfig
}): Promise<number> {
  const { sessionId, stepId, config } = opts
  const existing = await prisma.captureResponse.findMany({
    where: { sessionId, stepId },
    select: { captureOrdinal: true, status: true },
    orderBy: { captureOrdinal: 'desc' },
  })
  // Active (not failed) prior takes count against the retake budget. Failed
  // takes are not counted so a flaky network doesn't lock out the candidate.
  const liveTakes = existing.filter((r) => r.status !== 'failed').length
  if (liveTakes === 0) return 1
  if (!config.allowRetake) {
    throw new CaptureError('retake_not_allowed', 'This step does not allow retakes', 409)
  }
  // maxRetakes counts retakes beyond the first. So maxRetakes=2 means up to
  // three total takes: original + 2 retakes.
  const limit = config.maxRetakes != null ? 1 + config.maxRetakes : Infinity
  if (liveTakes >= limit) {
    throw new CaptureError('max_retakes_exceeded', `Retake limit reached (${limit})`, 409)
  }
  return (existing[0]?.captureOrdinal ?? 0) + 1
}

// Phase 1A entry: create a fresh CaptureResponse row in 'uploading' state and
// return the deterministic storage key. The caller (presign API route) signs
// the PUT against that key.
//
// Reject text/upload/ai_call modes from the media presign path: text never
// involves S3, upload is reserved for a future arbitrary-file capture
// pipeline with its own validation, and ai_call audio is held by the
// external provider.
export async function createCaptureForUpload(opts: {
  sessionId: string
  stepId: string
  mode: CaptureMode
  mimeType: string
}): Promise<{ capture: CaptureResponse; storageKey: string; config: CaptureConfig }> {
  const { sessionId, stepId, mode, mimeType } = opts
  const { session, step, config } = await loadCaptureContext({ sessionId, stepId })
  if (config.mode !== mode) {
    throw new CaptureError(
      'mode_not_supported_phase',
      `Step is configured for mode '${config.mode}', not '${mode}'`,
      400
    )
  }
  // Block non-media modes before touching S3 or issuing a presign URL. This
  // is the policy guard the spec asks for: text/upload/ai_call must not
  // hit the media presign path.
  if (!isMediaPresignMode(mode)) {
    throw new CaptureError(
      'mode_not_supported_phase',
      `Capture mode '${mode}' does not use the media presign path`,
      400
    )
  }
  if (!CAPTURE_MODES_PHASE_1A.includes(mode)) {
    throw new CaptureError(
      'mode_not_supported_phase',
      `Capture mode '${mode}' is not yet implemented`,
      400
    )
  }
  if (!isMimeAllowed(mode, mimeType)) {
    throw new CaptureError(
      'mime_not_allowed',
      `MIME type '${mimeType}' is not allowed for mode '${mode}'`,
      400
    )
  }
  const captureOrdinal = await nextOrdinalFor({ sessionId, stepId, config })
  assertFieldGuards({ captureOrdinal })

  // Create the row first, then derive the key from its id. Using the row id in
  // the key keeps it unique per take and lets the playback route confirm
  // ownership via parseCaptureStorageKey.
  return prisma.$transaction(async (tx) => {
    const capture = await tx.captureResponse.create({
      data: {
        workspaceId: session.workspaceId,
        flowId: session.flowId,
        stepId: step.id,
        sessionId: session.id,
        mode,
        prompt: config.prompt ?? null,
        mimeType,
        captureOrdinal,
        storageProvider: CAPTURE_STORAGE_PROVIDER,
        status: 'uploading',
      },
    })
    const storageKey = buildCaptureStorageKey({
      workspaceId: session.workspaceId,
      sessionId: session.id,
      stepId: step.id,
      captureResponseId: capture.id,
      mimeType,
    })
    const updated = await tx.captureResponse.update({
      where: { id: capture.id },
      data: { storageKey },
    })
    return { capture: updated, storageKey, config }
  })
}

// Transitions an uploading row forward after the candidate's PUT lands. The
// caller passes the HEAD-derived size; this layer validates against the
// global ceiling. Phase 1A jumps straight to 'processed'.
//
// Optional duration is recorded if the candidate's recorder measured it
// client-side. Future Phase 1B will measure server-side via ffprobe.
export async function finalizeCaptureUpload(opts: {
  captureId: string
  sessionId: string
  observed: { contentLength?: number; contentType?: string }
  durationSec?: number | null
}): Promise<CaptureResponse> {
  const { captureId, sessionId, observed } = opts
  const capture = await prisma.captureResponse.findUnique({ where: { id: captureId } })
  if (!capture) throw new CaptureError('capture_not_found', 'Capture not found', 404)
  if (capture.sessionId !== sessionId) {
    // Defends against a candidate trying to finalize another session's
    // upload row. The presign route hands out captureIds keyed to a
    // specific session; mixing them up should be 403.
    throw new CaptureError('forbidden_workspace', 'Capture does not belong to this session', 403)
  }
  if (capture.status !== 'uploading') {
    throw new CaptureError(
      'invalid_transition',
      `Cannot finalize from status '${capture.status}'`,
      409
    )
  }

  const contentLength = observed.contentLength ?? null
  // App-layer guards on the values about to land in the DB. The Prisma
  // column types allow these in principle (Int? / Float?); the DB will not
  // catch a negative duration. Reject here so we never persist nonsense.
  assertFieldGuards({
    durationSec: opts.durationSec ?? null,
    fileSizeBytes: contentLength,
  })

  // Phase 1A: no transcription/AI, so we collapse uploaded→processed in a
  // single update. The status field still tells the recruiter UI it's ready.
  return prisma.captureResponse.update({
    where: { id: capture.id },
    data: {
      status: 'processed',
      fileSizeBytes: contentLength,
      durationSec: opts.durationSec ?? capture.durationSec ?? null,
    },
  })
}

// Marks a capture failed with a reason. Idempotent — calling failCapture on a
// row that is already failed is a no-op so the candidate retry path doesn't
// have to read state first.
export async function failCapture(opts: {
  captureId: string
  reason: string
}): Promise<CaptureResponse | null> {
  const { captureId, reason } = opts
  const capture = await prisma.captureResponse.findUnique({ where: { id: captureId } })
  if (!capture) return null
  if (capture.status === 'failed') return capture
  if (capture.status === 'processed') {
    // Don't undo a successful upload via fail. Caller should be marking a
    // different row.
    throw new CaptureError(
      'invalid_transition',
      'Cannot fail a processed capture',
      409
    )
  }
  return prisma.captureResponse.update({
    where: { id: capture.id },
    data: { status: 'failed', errorMessage: reason.slice(0, 1000) },
  })
}

// Workspace-scoped read for the recruiter list endpoint. Returns the active
// (highest-ordinal, processed) take per (session, step) plus optionally the
// full history if includeRetakes is true. Always filters by workspaceId so a
// recruiter from workspace A can't read workspace B captures by guessing IDs.
export async function listSessionCaptures(opts: {
  workspaceId: string
  sessionId: string
  includeRetakes?: boolean
}): Promise<CaptureResponse[]> {
  const rows = await prisma.captureResponse.findMany({
    where: {
      workspaceId: opts.workspaceId,
      sessionId: opts.sessionId,
    },
    orderBy: [{ stepId: 'asc' }, { captureOrdinal: 'desc' }],
  })
  if (opts.includeRetakes) return rows
  // Collapse to one row per step — prefer processed > uploaded > uploading >
  // failed > draft, then highest ordinal.
  const byStep = new Map<string, CaptureResponse>()
  const statusRank: Record<string, number> = {
    processed: 5,
    uploaded: 4,
    processing: 3,
    uploading: 2,
    failed: 1,
    draft: 0,
  }
  for (const row of rows) {
    const existing = byStep.get(row.stepId)
    if (!existing) {
      byStep.set(row.stepId, row)
      continue
    }
    const a = statusRank[existing.status] ?? -1
    const b = statusRank[row.status] ?? -1
    if (b > a || (b === a && row.captureOrdinal > existing.captureOrdinal)) {
      byStep.set(row.stepId, row)
    }
  }
  return Array.from(byStep.values())
}

// Loads a single capture for a workspace-scoped reader (recruiter playback).
// Throws CaptureError('forbidden_workspace') if the row exists but belongs to
// a different workspace — never leaks existence to outsiders.
export async function loadCaptureForWorkspace(opts: {
  captureId: string
  workspaceId: string
}): Promise<CaptureResponse> {
  const capture = await prisma.captureResponse.findUnique({ where: { id: opts.captureId } })
  if (!capture) throw new CaptureError('capture_not_found', 'Capture not found', 404)
  if (capture.workspaceId !== opts.workspaceId) {
    // 404 instead of 403 here — we don't want to confirm existence to
    // someone in the wrong workspace.
    throw new CaptureError('capture_not_found', 'Capture not found', 404)
  }
  return capture
}
