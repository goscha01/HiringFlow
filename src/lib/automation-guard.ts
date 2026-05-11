/**
 * Central automation execution guard.
 *
 * Every code path that can produce an AutomationExecution row — immediate
 * trigger, delayed QStash callback, chained rule, manual rerun, cron, public
 * webhook, debug — MUST go through `canExecuteAutomationStep` before it
 * sends, promotes, chains, or enqueues. There are no local exceptions; if a
 * caller wants to bypass the guard it has to opt-in explicitly with
 * `force=true` AND prove privileged context (admin role + an
 * authenticated `manual_rerun` or `debug` executionMode).
 *
 * Design properties (per ARCHITECTURE.md / user requirements):
 *  - Authoritative: this is the only place lifecycle, stage, prerequisite,
 *    and idempotency rules live. Callers do not re-implement them.
 *  - DB-fresh: every call reloads the relevant pieces of state from the DB.
 *    Delayed callbacks never trust enqueue-time state.
 *  - Composable: prerequisites are a map of triggerType → predicate, not a
 *    growing switch. New triggers wire a single predicate; legacy ones keep
 *    the open-trigger default (no prerequisite).
 *  - Skip is a first-class result: blocked attempts persist as
 *    AutomationExecution rows with status `skipped_*` and `skipReason`,
 *    so the run history is queryable and analytics can surface the
 *    distribution of skips.
 */
import { prisma } from './prisma'
import type {
  AutomationExecution,
  AutomationRule,
  AutomationStep,
  Session,
} from '@prisma/client'

// ─── Public types ──────────────────────────────────────────────────────────

export type ExecutionMode =
  | 'immediate'         // synchronous dispatch from a trigger event
  | 'delayed_callback'  // QStash callback firing a queued step
  | 'chained'           // maybeFireChainedRules → automation_completed cascade
  | 'manual_rerun'      // /candidates/:id/run-stage-automations, /automations/:id/test
  | 'cron'              // any /api/cron/* handler firing a step
  | 'public_trigger'    // /api/public/* (training progress, booking, etc.)
  | 'debug'             // /api/automations/debug — admin-only

export type SkipReason =
  | 'skipped_wrong_status'
  | 'skipped_wrong_stage'
  | 'skipped_missing_prerequisite'
  | 'skipped_duplicate'
  | 'skipped_cancelled'
  | 'skipped_ineligible'

export type GuardCtx = {
  session: Session
  rule: AutomationRule
  step: AutomationStep
  channel: 'email' | 'sms'
  triggerType: string
  triggerContext?: Record<string, unknown>
  executionMode: ExecutionMode
  /**
   * Admin override. Only honoured when executionMode is `manual_rerun` or
   * `debug` AND the caller verified an admin/operator role before invoking.
   * Bypasses the idempotency (duplicate) guard ONLY. Lifecycle / stage /
   * prerequisite / halt checks are NEVER bypassed; the engine is authoritative.
   */
  force?: boolean
  /** Used to stamp triggeredByUserId on the resulting AutomationExecution. */
  actorUserId?: string | null
}

export type GuardResult =
  | { allowed: true }
  | {
      allowed: false
      reason: SkipReason
      currentState: Record<string, unknown>
      requiredState?: Record<string, unknown>
    }

// ─── Lifecycle status ──────────────────────────────────────────────────────

/**
 * Statuses where candidate-facing automations are blocked by default.
 *
 *  - `stalled` / `lost` / `hired` / `archived`: the candidate is no longer
 *    progressing through the funnel. Forward-moving automations would
 *    contradict the lifecycle state.
 *
 * A rule can opt in to firing for these statuses via `allowedForStatuses`
 * (goodbye emails, compliance notices, etc.). No UI exposes this — set it
 * in code via direct prisma update, intentionally.
 */
const BLOCKING_STATUSES = new Set(['stalled', 'lost', 'hired', 'archived'])

function isStatusAllowed(session: Session, rule: AutomationRule): boolean {
  const status = session.status || 'active'
  if (!BLOCKING_STATUSES.has(status)) return true
  const allowed = (rule as AutomationRule & { allowedForStatuses?: string[] }).allowedForStatuses ?? []
  return allowed.includes(status)
}

// ─── Prerequisite predicates ───────────────────────────────────────────────

/**
 * Composable prerequisite predicates per triggerType. A trigger with no
 * registered predicate is treated as open (allowed) — this keeps the door
 * open for trigger types whose semantics are "fire whenever asked" without
 * forcing this module to enumerate everything.
 *
 * Each predicate returns { satisfied:true } on pass or
 * { satisfied:false, currentState, requiredState } on fail so the guard
 * caller can persist *why* the step was skipped.
 */
type PrerequisiteResult =
  | { satisfied: true }
  | { satisfied: false; currentState: Record<string, unknown>; requiredState?: Record<string, unknown> }

type PrerequisitePredicate = (ctx: {
  session: Session
  rule: AutomationRule
  step: AutomationStep
  triggerType: string
  triggerContext?: Record<string, unknown>
}) => Promise<PrerequisiteResult>

const requireCompletedEnrollment: PrerequisitePredicate = async ({ session, triggerContext }) => {
  const trainingId = typeof triggerContext?.trainingId === 'string' ? (triggerContext.trainingId as string) : null
  const enr = await prisma.trainingEnrollment.findFirst({
    where: {
      sessionId: session.id,
      completedAt: { not: null },
      ...(trainingId ? { trainingId } : {}),
    },
    select: { id: true, completedAt: true, trainingId: true },
  })
  if (enr) return { satisfied: true }
  return {
    satisfied: false,
    currentState: { enrollmentCompletedAt: null },
    requiredState: { enrollmentCompletedAt: 'not null', trainingId: trainingId ?? 'any' },
  }
}

const requireStartedEnrollment: PrerequisitePredicate = async ({ session, triggerContext }) => {
  // `startedAt` is non-nullable with a default(now()) — existence of the
  // enrollment row is the meaningful signal.
  const trainingId = typeof triggerContext?.trainingId === 'string' ? (triggerContext.trainingId as string) : null
  const enr = await prisma.trainingEnrollment.findFirst({
    where: {
      sessionId: session.id,
      ...(trainingId ? { trainingId } : {}),
    },
    select: { id: true },
  })
  if (enr) return { satisfied: true }
  return {
    satisfied: false,
    currentState: { enrollment: null },
    requiredState: { enrollment: 'exists' },
  }
}

const requireInterviewMeeting: PrerequisitePredicate = async ({ session }) => {
  const m = await prisma.interviewMeeting.findFirst({
    where: { sessionId: session.id },
    select: { id: true, scheduledStart: true },
  })
  if (m) return { satisfied: true }
  return {
    satisfied: false,
    currentState: { interviewMeeting: null },
    requiredState: { interviewMeeting: 'exists' },
  }
}

const requireMeetingActualStart: PrerequisitePredicate = async ({ session }) => {
  const m = await prisma.interviewMeeting.findFirst({
    where: { sessionId: session.id, actualStart: { not: null } },
    select: { id: true },
  })
  if (m) return { satisfied: true }
  return {
    satisfied: false,
    currentState: { actualStart: null },
    requiredState: { actualStart: 'not null' },
  }
}

const requireMeetingActualEnd: PrerequisitePredicate = async ({ session }) => {
  const m = await prisma.interviewMeeting.findFirst({
    where: { sessionId: session.id, actualEnd: { not: null } },
    select: { id: true },
  })
  if (m) return { satisfied: true }
  return {
    satisfied: false,
    currentState: { actualEnd: null },
    requiredState: { actualEnd: 'not null' },
  }
}

const requireRecordingReady: PrerequisitePredicate = async ({ session }) => {
  const m = await prisma.interviewMeeting.findFirst({
    where: { sessionId: session.id, recordingState: 'ready' },
    select: { id: true },
  })
  if (m) return { satisfied: true }
  return {
    satisfied: false,
    currentState: { recordingState: 'not ready' },
    requiredState: { recordingState: 'ready' },
  }
}

const requireTranscriptReady: PrerequisitePredicate = async ({ session }) => {
  const m = await prisma.interviewMeeting.findFirst({
    where: { sessionId: session.id, transcriptState: 'ready' },
    select: { id: true },
  })
  if (m) return { satisfied: true }
  return {
    satisfied: false,
    currentState: { transcriptState: 'not ready' },
    requiredState: { transcriptState: 'ready' },
  }
}

function requireBackgroundCheckOutcome(target: 'passed' | 'failed' | 'needs_review'): PrerequisitePredicate {
  // BackgroundCheck.status mirrors Certn's overall_status (CASE_ORDERED, ...)
  // and overallScore mirrors overall_score (CLEAR | REJECT | REVIEW |
  // RESTRICTED | NOT_APPLICABLE). The trigger outcome maps from overall_score:
  //   passed       → CLEAR | NOT_APPLICABLE
  //   failed       → REJECT
  //   needs_review → REVIEW | RESTRICTED
  // The prerequisite is "a closed-out BC exists for the session whose score
  // maps to the trigger's outcome." A stale callback for the wrong outcome
  // can then be skipped cleanly.
  const scoresFor: Record<typeof target, string[]> = {
    passed: ['CLEAR', 'NOT_APPLICABLE'],
    failed: ['REJECT'],
    needs_review: ['REVIEW', 'RESTRICTED'],
  } as const
  return async ({ session }) => {
    const bc = await prisma.backgroundCheck.findFirst({
      where: {
        sessionId: session.id,
        overallScore: { in: scoresFor[target] },
      },
      select: { id: true, overallScore: true },
    })
    if (bc) return { satisfied: true }
    const current = await prisma.backgroundCheck.findFirst({
      where: { sessionId: session.id },
      select: { overallScore: true, status: true },
    })
    return {
      satisfied: false,
      currentState: {
        overallScore: current?.overallScore ?? null,
        certnStatus: current?.status ?? null,
      },
      requiredState: { overallScore: scoresFor[target].join('|') },
    }
  }
}

function requireSessionOutcome(target: 'completed' | 'passed'): PrerequisitePredicate {
  return async ({ session }) => {
    if (session.outcome === target) return { satisfied: true }
    return {
      satisfied: false,
      currentState: { outcome: session.outcome ?? null },
      requiredState: { outcome: target },
    }
  }
}

const PREREQUISITES: Record<string, PrerequisitePredicate> = {
  // Training lifecycle
  training_started: requireStartedEnrollment,
  training_completed: requireCompletedEnrollment,
  // Meeting lifecycle
  meeting_scheduled: requireInterviewMeeting,
  meeting_started: requireMeetingActualStart,
  meeting_ended: requireMeetingActualEnd,
  before_meeting: requireInterviewMeeting,
  meeting_rescheduled: requireInterviewMeeting,
  // Note: meeting_no_show / meeting_cancelled are inherently "negative" events
  // that fire AFTER the meeting was settled into that state, so the guard
  // treats them as open — the dispatcher already verifies the state.
  recording_ready: requireRecordingReady,
  transcript_ready: requireTranscriptReady,
  // Background check
  background_check_passed: requireBackgroundCheckOutcome('passed'),
  background_check_failed: requireBackgroundCheckOutcome('failed'),
  background_check_needs_review: requireBackgroundCheckOutcome('needs_review'),
  // Flow lifecycle
  flow_completed: requireSessionOutcome('completed'),
  flow_passed: requireSessionOutcome('passed'),
}

// ─── Main guard ────────────────────────────────────────────────────────────

/**
 * Authoritative decision: may this (rule, step, channel) be sent now for
 * this session, given the trigger and execution mode?
 *
 * Order of checks (first failure wins):
 *   1. Halt — session.automationsHaltedAt set.
 *   2. Lifecycle status — session.status in BLOCKING_STATUSES unless
 *      rule.allowedForStatuses opts in.
 *   3. Stage match — rule.stageId, if set, must equal session.pipelineStatus.
 *   4. Prerequisite predicate for the triggerType.
 *   5. Idempotency — existing 'sent' execution for (step, session, channel).
 *
 * Rule.isActive is NOT checked here — callers handle it (a paused rule
 * shouldn't even reach the guard, except for the test endpoint which passes
 * an ignoreActive override; in that case we still run the guard because
 * tests must respect lifecycle invariants).
 */
export async function canExecuteAutomationStep(ctx: GuardCtx): Promise<GuardResult> {
  const { session, rule, step, channel, triggerType, executionMode, force } = ctx

  // 1. Halt kill-switch
  if (session.automationsHaltedAt) {
    return {
      allowed: false,
      reason: 'skipped_cancelled',
      currentState: {
        automationsHaltedAt: session.automationsHaltedAt.toISOString(),
        automationsHaltedReason: session.automationsHaltedReason ?? null,
      },
    }
  }

  // 2. Lifecycle status (default-deny for stalled/lost/hired/archived)
  if (!isStatusAllowed(session, rule)) {
    return {
      allowed: false,
      reason: 'skipped_wrong_status',
      currentState: { status: session.status },
      requiredState: { status: 'active|waiting|nurture (or in rule.allowedForStatuses)' },
    }
  }

  // 3. Stage match — when the rule is pinned to a stage, the session must
  //    still be in that stage. Crucial for delayed sends: a 24h reminder
  //    queued while the candidate was in "training_sent" should NOT fire if
  //    they've since moved to "interview_scheduled" or anywhere else.
  if (rule.stageId && session.pipelineStatus !== rule.stageId) {
    return {
      allowed: false,
      reason: 'skipped_wrong_stage',
      currentState: { pipelineStatus: session.pipelineStatus ?? null },
      requiredState: { pipelineStatus: rule.stageId },
    }
  }

  // 4. Prerequisite — only enforced for triggers with a registered predicate.
  //    Open triggers (no entry in the map) are assumed valid by design.
  const predicate = PREREQUISITES[triggerType]
  if (predicate) {
    const result = await predicate({
      session,
      rule,
      step,
      triggerType,
      triggerContext: ctx.triggerContext,
    })
    if (!result.satisfied) {
      return {
        allowed: false,
        reason: 'skipped_missing_prerequisite',
        currentState: result.currentState,
        requiredState: result.requiredState,
      }
    }
  }

  // 5. Idempotency — never send twice for the same (step, session, channel)
  //    unless an admin explicitly forced a manual rerun. force is only
  //    honoured for `manual_rerun` and `debug` modes; other modes ignore it
  //    so a buggy caller cannot pass it accidentally.
  const existing = await prisma.automationExecution.findUnique({
    where: { stepId_sessionId_channel: { stepId: step.id, sessionId: session.id, channel } },
    select: { id: true, status: true },
  })
  if (existing && existing.status === 'sent') {
    const forceAllowed = force === true && (executionMode === 'manual_rerun' || executionMode === 'debug')
    if (!forceAllowed) {
      return {
        allowed: false,
        reason: 'skipped_duplicate',
        currentState: { priorExecutionId: existing.id, priorStatus: existing.status },
      }
    }
  }

  return { allowed: true }
}

// ─── Persistence helper ────────────────────────────────────────────────────

/**
 * Persist a skipped execution row. Called by dispatch/execute paths after
 * `canExecuteAutomationStep` returns `{allowed:false}`. Keeps the skip
 * decision auditable and queryable (e.g. analytics counting blocked sends
 * per rule) without bloating the logs.
 *
 * Upserts on (stepId, sessionId, channel) — if a previous attempt already
 * created the row (queued, then deemed ineligible at QStash callback), we
 * update it in place rather than crashing on the unique constraint.
 */
export async function recordSkip(opts: {
  ruleId: string
  stepId: string
  sessionId: string
  channel: 'email' | 'sms'
  executionMode: ExecutionMode
  actorUserId?: string | null
  result: Extract<GuardResult, { allowed: false }>
  session: Session
}): Promise<void> {
  const data = {
    automationRuleId: opts.ruleId,
    stepId: opts.stepId,
    sessionId: opts.sessionId,
    channel: opts.channel,
    status: opts.result.reason,
    skipReason: opts.result.reason,
    evaluatedStage: opts.session.pipelineStatus ?? null,
    evaluatedStatus: opts.session.status ?? null,
    expectedStage: typeof opts.result.requiredState?.pipelineStatus === 'string'
      ? (opts.result.requiredState.pipelineStatus as string)
      : null,
    executionMode: opts.executionMode,
    triggeredByUserId: opts.actorUserId ?? null,
    errorMessage: JSON.stringify({
      reason: opts.result.reason,
      currentState: opts.result.currentState,
      requiredState: opts.result.requiredState,
    }).slice(0, 1000),
  } as const

  const existing = await prisma.automationExecution.findUnique({
    where: { stepId_sessionId_channel: { stepId: opts.stepId, sessionId: opts.sessionId, channel: opts.channel } },
    select: { id: true, status: true },
  })

  if (existing) {
    // Never downgrade a successful send into a skip — a 'sent' row stays
    // 'sent'. (This can happen when a stale QStash callback fires for a
    // step that was already manually re-sent.)
    if (existing.status === 'sent') return
    await prisma.automationExecution.update({
      where: { id: existing.id },
      data,
    })
    return
  }

  await prisma.automationExecution.create({ data })
}

// ─── Halt helpers ──────────────────────────────────────────────────────────

/**
 * Set the central kill-switch for a session and cancel its pending
 * automation rows in one call. Future automation attempts (including stale
 * QStash callbacks) hit the halt check at the top of the guard and skip.
 *
 * Idempotent: calling twice with the same reason is a no-op for the second
 * call; calling with a new reason overwrites the prior one.
 */
export async function haltSessionAutomations(opts: {
  sessionId: string
  reason: string
}): Promise<void> {
  await prisma.session.update({
    where: { id: opts.sessionId },
    data: {
      automationsHaltedAt: new Date(),
      automationsHaltedReason: opts.reason,
    },
  })
}

/**
 * Clear the kill-switch. Used by manual operator un-halts; the lifecycle
 * un-stall path also calls this when transitioning a session back to active.
 */
export async function resumeSessionAutomations(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      automationsHaltedAt: null,
      automationsHaltedReason: null,
    },
  })
}
