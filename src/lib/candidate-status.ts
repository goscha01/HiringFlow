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

/**
 * Workspace-configurable custom statuses. Stored as JSON on
 * `Workspace.settings.customStatuses`. Custom statuses are MANUAL ONLY —
 * the cron never auto-assigns them, and they don't carry the lifecycle
 * stamps (`stalledAt`/`lostAt`/`hiredAt`). They appear as additional tabs
 * on the kanban and as additional "Move to …" buttons on the candidate
 * detail page.
 *
 * `id` is the value written to `Session.status`. Should be slug-shaped
 * and prefixed with `cust_` so it never collides with the built-in enum
 * values. `tone` reuses the BadgeTone vocabulary so the badge colors are
 * consistent with the built-in statuses.
 */
export interface CustomStatus {
  id: string
  label: string
  tone: CandidateStatusTone
}

export function isCustomStatusId(id: string): boolean {
  return id.startsWith('cust_')
}

export function normalizeCustomStatuses(raw: unknown): CustomStatus[] {
  if (!Array.isArray(raw)) return []
  const out: CustomStatus[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : null
    const label = typeof r.label === 'string' ? r.label.trim() : null
    const tone = typeof r.tone === 'string' ? r.tone : 'neutral'
    if (!id || !label || !isCustomStatusId(id) || seen.has(id)) continue
    if (!['neutral', 'brand', 'success', 'warn', 'info', 'danger'].includes(tone)) continue
    seen.add(id)
    out.push({ id, label, tone: tone as CandidateStatusTone })
  }
  return out
}

export function makeCustomStatusId(label: string, existing: CustomStatus[]): string {
  const base = 'cust_' + (label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'status')
  const taken = new Set(existing.map((s) => s.id))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

/**
 * Runtime check that accepts a built-in status OR any of the workspace's
 * custom status ids. Use this from API routes that validate user input.
 */
export function isAllowedStatus(v: unknown, customStatuses: CustomStatus[] = []): v is string {
  if (typeof v !== 'string') return false
  if ((CANDIDATE_STATUSES as readonly string[]).includes(v)) return true
  return customStatuses.some((s) => s.id === v)
}

export function isDispositionReason(v: unknown): v is CandidateDispositionReason {
  return typeof v === 'string' && (CANDIDATE_DISPOSITION_REASONS as readonly string[]).includes(v)
}

// Display metadata for the status enum. `tone` matches the Badge component's
// BadgeTone vocabulary so the kanban / detail page can pass it through.
export type CandidateStatusTone = 'neutral' | 'brand' | 'success' | 'warn' | 'info' | 'danger'
export const STATUS_DISPLAY: Record<CandidateStatus, { label: string; tone: CandidateStatusTone }> = {
  active:  { label: 'Active',   tone: 'brand'   },
  waiting: { label: 'Waiting',  tone: 'info'    },
  stalled: { label: 'Stalled',  tone: 'warn'    },
  nurture: { label: 'Nurture',  tone: 'neutral' },
  lost:    { label: 'Lost',     tone: 'danger'  },
  hired:   { label: 'Hired',    tone: 'success' },
}

// Human-readable labels for the disposition enum. Used on candidate cards
// and the detail page's Reason field.
export const DISPOSITION_DISPLAY: Record<CandidateDispositionReason, string> = {
  no_response_after_video_invite: 'No response after video invite',
  video_interview_not_completed:  'Video interview not completed',
  training_not_started:           'Training not started',
  training_not_completed:         'Training not completed',
  interview_no_show:              'Interview no-show',
  candidate_declined:             'Candidate declined',
  failed_screening:               'Failed screening',
  failed_training:                'Failed training',
  not_qualified:                  'Not qualified',
  not_selected:                   'Not selected',
  hired_elsewhere:                'Hired elsewhere',
  manual_other:                   'Other',
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
  automationsHaltedAt?: Date | null
  automationsHaltedReason?: string | null
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
      // Halt downstream automations — pending QStash callbacks for this
      // candidate hit the guard's halt check and skip. Central kill-switch.
      patch.automationsHaltedAt = now
      patch.automationsHaltedReason = `lifecycle:stalled:${opts.dispositionReason ?? 'manual'}`
      break
    case 'lost':
      patch.lostAt = now
      patch.hiredAt = null
      // Keep stalledAt — historically useful to know how long it sat stalled
      // before being declared lost. Cleared on reactivate.
      patch.automationsHaltedAt = now
      patch.automationsHaltedReason = `lifecycle:lost:${opts.dispositionReason ?? 'manual'}`
      break
    case 'hired':
      patch.hiredAt = now
      patch.stalledAt = null
      patch.lostAt = null
      // Hired implies success — clear any stale disposition reason unless the
      // caller passed one explicitly (e.g. 'hired_elsewhere' would be lost,
      // not hired, but defensive null-out for the happy path).
      if (opts.dispositionReason === undefined) patch.dispositionReason = null
      // Halt forward-moving automations for hired candidates. Rules that
      // intentionally fire on hired (e.g. an offer-acceptance follow-up)
      // must opt in via AutomationRule.allowedForStatuses.
      patch.automationsHaltedAt = now
      patch.automationsHaltedReason = 'lifecycle:hired'
      break
    case 'active':
    case 'waiting':
    case 'nurture':
      // Reactivate-style transition — clear all the terminal stamps, the
      // disposition reason (unless the caller explicitly passed one, e.g. a
      // recruiter moving to nurture with `hired_elsewhere`), AND the
      // automation kill-switch. Reactivated candidates are eligible for
      // automations again.
      patch.stalledAt = null
      patch.lostAt = null
      patch.hiredAt = null
      patch.automationsHaltedAt = null
      patch.automationsHaltedReason = null
      if (opts.dispositionReason === undefined) patch.dispositionReason = null
      break
  }

  return patch
}
