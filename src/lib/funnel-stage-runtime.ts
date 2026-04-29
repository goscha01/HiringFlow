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
import { findStageForEvent, normalizeStages, type StageTriggerEvent } from './funnel-stages'

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

  const newStatus = stage?.id ?? opts.legacyStatus
  if (!newStatus) return null

  await prisma.session.update({
    where: { id: opts.sessionId },
    data: { pipelineStatus: newStatus },
  }).catch(() => {})

  return newStatus
}
