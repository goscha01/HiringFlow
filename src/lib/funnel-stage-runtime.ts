/**
 * Server-side glue between system events and the workspace's funnel stages.
 *
 * Each event site (flow passed, training started/completed, meeting scheduled,
 * etc.) calls applyStageTrigger() with the session id, the event name, and
 * any relevant target ids. We look up the workspace's configured stages and,
 * if any match, write that stage's id into Session.pipelineStatus —
 * overwriting whatever was there (per "automatic always wins").
 *
 * If no stage matches, we fall back to the caller-provided legacy status
 * string so existing display logic keeps working until the workspace
 * configures triggers.
 */

import { prisma } from './prisma'
import { setPipelineStatus } from './pipeline-status'
import {
  findStageForEvent,
  mapLegacyStatusToStageId,
  type StageTriggerEvent,
  type FunnelStage,
} from './funnel-stages'
import { resolvePipelineForSession, stagesFor } from './pipelines'

// Events that mean the candidate is actively progressing — receiving any of
// these should pull a previously-stalled candidate back into the active pool.
// We only flip `status` when it was `stalled` so a manually-set `nurture`,
// `lost`, or `hired` candidate is NOT silently reactivated by a late-firing
// event (e.g. an old training_completed webhook arriving after a recruiter
// already declared the candidate hired_elsewhere).
//
// `meeting_no_show` and `meeting_cancelled` are deliberately excluded — those
// are not progress.
const FORWARD_PROGRESS_EVENTS = new Set<StageTriggerEvent>([
  'flow_passed',
  'flow_completed',
  'training_started',
  'training_completed',
  'meeting_scheduled',
  'meeting_confirmed',
  'meeting_started',
  'meeting_ended',
  'background_check_passed',
])

export async function applyStageTrigger(opts: {
  sessionId: string
  workspaceId: string
  event: StageTriggerEvent
  flowId?: string
  trainingId?: string
  // Status to write if no auto-rule matches — preserves the pre-existing
  // hardcoded behaviour for unconfigured workspaces.
  legacyStatus?: string
}): Promise<string | null> {
  // Resolve which pipeline applies to this candidate. Stages now live on
  // Pipeline rows — the session's flow points at one, falling back to the
  // workspace default. Workspaces with no Pipeline rows yet get one created
  // on the fly from their legacy Workspace.settings.funnelStages.
  const pipeline = await resolvePipelineForSession({
    sessionId: opts.sessionId,
    workspaceId: opts.workspaceId,
  })
  const stages = pipeline ? stagesFor(pipeline) : []
  const stage = findStageForEvent(stages, opts.event, { flowId: opts.flowId, trainingId: opts.trainingId })

  // Best-effort: if this event represents forward progress, reactivate a
  // stalled candidate. Runs whether or not a stage trigger matched (so even
  // workspaces that haven't wired triggers benefit). Scoped to status='stalled'
  // so we never overwrite a recruiter's deliberate 'nurture' / 'lost' / 'hired'.
  const reactivatePatch: Record<string, unknown> | null = FORWARD_PROGRESS_EVENTS.has(opts.event)
    ? { status: 'active', stalledAt: null, dispositionReason: null }
    : null

  // Pull the current pipelineStatus once so both branches share the same
  // furthest-wins guard. We never move a candidate backwards through the
  // funnel based on a system event, regardless of whether the destination
  // came from a configured stage trigger or the legacy fallback.
  const session = await prisma.session.findUnique({
    where: { id: opts.sessionId },
    select: { pipelineStatus: true },
  })
  const currentOrder = currentStageOrder(stages, session?.pipelineStatus ?? null)

  // No matching stage configured — fall back to the legacy hardcoded marker so
  // unconfigured workspaces keep working.
  if (!stage) {
    if (reactivatePatch) {
      await prisma.session.updateMany({
        where: { id: opts.sessionId, status: 'stalled' },
        data: reactivatePatch,
      }).catch(() => {})
    }
    if (!opts.legacyStatus) return null
    // Apply the same furthest-wins guard to the legacy path. Without this, a
    // late `meeting_no_show` could flip a candidate currently sitting in
    // `hired` straight to `rejected` because the legacy path bypassed the
    // order check entirely.
    const legacyOrder = currentStageOrder(stages, opts.legacyStatus)
    if (currentOrder !== null && legacyOrder !== null && legacyOrder < currentOrder) {
      return null
    }
    await setPipelineStatus({
      sessionId: opts.sessionId,
      toStatus: opts.legacyStatus,
      source: `auto:${opts.event}`,
      metadata: {
        legacyFallback: true,
        flowId: opts.flowId,
        trainingId: opts.trainingId,
      },
    }).catch(() => {})
    return opts.legacyStatus
  }

  // Furthest-stage-wins guard: don't move a candidate backwards through the
  // funnel based on a later-firing event for an earlier stage. Only apply the
  // trigger if the matched stage is at or after the candidate's current
  // stage in the funnel order.
  if (currentOrder !== null && stage.order < currentOrder) {
    return null
  }

  await setPipelineStatus({
    sessionId: opts.sessionId,
    toStatus: stage.id,
    source: `auto:${opts.event}`,
    metadata: {
      flowId: opts.flowId,
      trainingId: opts.trainingId,
    },
  }).catch(() => {})

  if (reactivatePatch) {
    await prisma.session.updateMany({
      where: { id: opts.sessionId, status: 'stalled' },
      data: reactivatePatch,
    }).catch(() => {})
  }

  // The session is now in `stage.id`. Sweep any queued automation executions
  // whose rule is pinned to a different stage — the guard would skip them at
  // dispatch anyway, this just stops them from sitting in `queued` until they
  // expire. Dynamic import to avoid a circular dep (automation.ts imports
  // funnel-stage-runtime via applyStageTrigger).
  const { cancelStageMismatchedQueued } = await import('./automation')
  await cancelStageMismatchedQueued(opts.sessionId, stage.id).catch((err) => {
    console.error('[funnel-stage-runtime] cancelStageMismatchedQueued failed:', err)
  })

  return stage.id
}

function currentStageOrder(stages: FunnelStage[], pipelineStatus: string | null): number | null {
  if (!pipelineStatus) return null
  const direct = stages.find((s) => s.id === pipelineStatus)
  if (direct) return direct.order
  // Resolve legacy status strings (e.g. 'rejected', 'training_completed') to
  // their default-stage equivalent so callers passing a legacy value still
  // get a meaningful order back. Returns null only when the value matches
  // neither a configured stage nor a known legacy status.
  const mapped = mapLegacyStatusToStageId(pipelineStatus)
  const fallback = stages.find((s) => s.id === mapped)
  return fallback ? fallback.order : null
}
