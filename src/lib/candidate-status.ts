/**
 * Candidate status + disposition model.
 *
 * `status` is an orthogonal axis to `pipelineStatus` (which holds the funnel
 * stage id). A candidate can be `stage='video_interview_sent', status='stalled'`
 * — the stage represents the last real progress point, and the status tells the
 * board / analytics whether the candidate is still moving, stuck, or out.
 *
 * `dispositionReason` is a structured enum that explains *why* a candidate is
 * stalled / lost. It's distinct from the existing free-form
 * `Session.rejectionReason` (which stays as a recruiter-editable note) — the
 * enum is what analytics groups by.
 */

export type CandidateStatus =
  | 'active'
  | 'waiting'
  | 'stalled'
  | 'nurture'
  | 'lost'
  | 'hired'

export const CANDIDATE_STATUSES: readonly CandidateStatus[] = [
  'active',
  'waiting',
  'stalled',
  'nurture',
  'lost',
  'hired',
] as const

export type CandidateDispositionReason =
  | 'no_response_after_video_invite'
  | 'video_interview_not_completed'
  | 'training_not_started'
  | 'training_not_completed'
  | 'interview_no_show'
  | 'candidate_declined'
  | 'failed_screening'
  | 'failed_training'
  | 'not_qualified'
  | 'not_selected'
  | 'hired_elsewhere'
  | 'manual_other'

export const CANDIDATE_DISPOSITION_REASONS: readonly CandidateDispositionReason[] = [
  'no_response_after_video_invite',
  'video_interview_not_completed',
  'training_not_started',
  'training_not_completed',
  'interview_no_show',
  'candidate_declined',
  'failed_screening',
  'failed_training',
  'not_qualified',
  'not_selected',
  'hired_elsewhere',
  'manual_other',
] as const

export function isCandidateStatus(v: unknown): v is CandidateStatus {
  return typeof v === 'string' && (CANDIDATE_STATUSES as readonly string[]).includes(v)
}

export function isDispositionReason(v: unknown): v is CandidateDispositionReason {
  return typeof v === 'string' && (CANDIDATE_DISPOSITION_REASONS as readonly string[]).includes(v)
}

/**
 * Default timeouts for the cron-driven stalled detector. Stored on `Flow` so
 * different roles can run different SLAs; these are the fallback when a flow
 * leaves any timeout column null.
 */
export const DEFAULT_TIMEOUTS = {
  videoInterviewTimeoutDays: 3,
  trainingTimeoutDays: 5,
  noShowTimeoutHours: 24,
} as const

/**
 * Derive what the new `status`-axis fields should be when a manual lifecycle
 * action (mark stalled / lost / nurture / hired / reactivate) runs. Reactivate
 * is expressed as `status='active'` — this helper clears the matching
 * `*At` stamps and the disposition reason so the candidate is genuinely back
 * in the active pool.
 *
 * Returns the partial Prisma update payload. Fields not relevant to the
 * transition are intentionally absent so the caller can spread it over an
 * existing patch without overwriting unrelated columns.
 */
export function statusTransitionPatch(
  next: CandidateStatus,
  opts: { dispositionReason?: CandidateDispositionReason | null; now?: Date } = {},
): {
  status: CandidateStatus
  dispositionReason?: CandidateDispositionReason | null
  stalledAt?: Date | null
  lostAt?: Date | null
  hiredAt?: Date | null
} {
  const now = opts.now ?? new Date()
  const patch: ReturnType<typeof statusTransitionPatch> = { status: next }

  if (opts.dispositionReason !== undefined) {
    patch.dispositionReason = opts.dispositionReason
  }

  switch (next) {
    case 'stalled':
      patch.stalledAt = now
      patch.lostAt = null
      patch.hiredAt = null
      break
    case 'lost':
      patch.lostAt = now
      patch.hiredAt = null
      // Keep stalledAt — historically useful to know how long it sat stalled
      // before being declared lost. Cleared on reactivate.
      break
    case 'hired':
      patch.hiredAt = now
      patch.stalledAt = null
      patch.lostAt = null
      // Hired implies success — clear any stale disposition reason unless the
      // caller passed one explicitly (e.g. 'hired_elsewhere' would be lost,
      // not hired, but defensive null-out for the happy path).
      if (opts.dispositionReason === undefined) patch.dispositionReason = null
      break
    case 'active':
    case 'waiting':
    case 'nurture':
      // Reactivate-style transition — clear all the terminal stamps and the
      // disposition reason (unless the caller explicitly passed one, e.g. a
      // recruiter moving to nurture with `hired_elsewhere`).
      patch.stalledAt = null
      patch.lostAt = null
      patch.hiredAt = null
      if (opts.dispositionReason === undefined) patch.dispositionReason = null
      break
  }

  return patch
}
