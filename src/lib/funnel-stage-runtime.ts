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
import { findStageForEvent, normalizeStages, type StageTriggerEvent, type FunnelStage } from './funnel-stages'

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
  const ws = await prisma.workspace.findUnique({
    where: { id: opts.workspaceId },
    select: { settings: true },
  })
  const stages = normalizeStages((ws?.settings as { funnelStages?: unknown } | null)?.funnelStages)
  const stage = findStageForEvent(stages, opts.event, { flowId: opts.flowId, trainingId: opts.trainingId })

  // Best-effort: if this event represents forward progress, reactivate a
  // stalled candidate. Runs whether or not a stage trigger matched (so even
  // workspaces that haven't wired triggers benefit). Scoped to status='stalled'
  // so we never overwrite a recruiter's deliberate 'nurture' / 'lost' / 'hired'.
  const reactivatePatch: Record<string, unknown> | null = FORWARD_PROGRESS_EVENTS.has(opts.event)
    ? { status: 'active', stalledAt: null, dispositionReason: null }
    : null

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
    await prisma.session.update({
      where: { id: opts.sessionId },
      data: { pipelineStatus: opts.legacyStatus },
    }).catch(() => {})
    return opts.legacyStatus
  }

  // Furthest-stage-wins guard: don't move a candidate backwards through the
  // funnel based on a later-firing event for an earlier stage. Only apply the
  // trigger if the matched stage is at or after the candidate's current
  // stage in the funnel order.
  const session = await prisma.session.findUnique({
    where: { id: opts.sessionId },
    select: { pipelineStatus: true },
  })
  const currentOrder = currentStageOrder(stages, session?.pipelineStatus ?? null)
  if (currentOrder !== null && stage.order < currentOrder) {
    // Candidate is already further along — skip this auto-move.
    return null
  }

  await prisma.session.update({
    where: { id: opts.sessionId },
    data: { pipelineStatus: stage.id },
  }).catch(() => {})

  if (reactivatePatch) {
    await prisma.session.updateMany({
      where: { id: opts.sessionId, status: 'stalled' },
      data: reactivatePatch,
    }).catch(() => {})
  }

  return stage.id
}

function currentStageOrder(stages: FunnelStage[], pipelineStatus: string | null): number | null {
  if (!pipelineStatus) return null
  const direct = stages.find((s) => s.id === pipelineStatus)
  if (direct) return direct.order
  return null
}
