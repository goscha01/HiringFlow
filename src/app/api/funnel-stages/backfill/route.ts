import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findFurthestStageForEvents, normalizeStages, type StageTriggerEvent } from '@/lib/funnel-stages'

interface SessionEvent {
  event: StageTriggerEvent
  flowId?: string
  trainingId?: string
}

/**
 * Re-applies funnel stage triggers to all existing candidates in the
 * workspace. Walks each session's event history (flow outcome, training
 * enrollments, interview meetings) and finds the most recent event that
 * matches a configured trigger — that stage's id becomes the candidate's
 * new pipeline_status.
 *
 * Body: { commit?: boolean }   commit defaults to false (dry-run). When
 * false, only returns the diff so the UI can show a confirmation. When
 * true, writes the new pipeline_status values.
 */
export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { commit = false } = await request.json().catch(() => ({}))

  const workspace = await prisma.workspace.findUnique({
    where: { id: ws.workspaceId },
    select: { settings: true },
  })
  const stages = normalizeStages((workspace?.settings as { funnelStages?: unknown } | null)?.funnelStages)
  if (stages.length === 0) {
    return NextResponse.json({ moves: [], byStage: {}, total: 0 })
  }
  const stageById = new Map(stages.map((s) => [s.id, s]))

  const sessions = await prisma.session.findMany({
    where: { workspaceId: ws.workspaceId },
    select: {
      id: true,
      candidateName: true,
      candidateEmail: true,
      pipelineStatus: true,
      outcome: true,
      finishedAt: true,
      flowId: true,
      trainingEnrollments: {
        select: { trainingId: true, status: true, startedAt: true, completedAt: true },
      },
      interviewMeetings: {
        select: { scheduledStart: true, actualStart: true, actualEnd: true },
      },
    },
  })

  const moves: Array<{
    sessionId: string
    candidateName: string | null
    fromStatus: string | null
    toStageId: string
    toStageLabel: string
  }> = []
  const byStage: Record<string, number> = {}

  for (const s of sessions) {
    const events: SessionEvent[] = []

    if (s.outcome === 'passed' && s.finishedAt) {
      events.push({ event: 'flow_passed', flowId: s.flowId })
    }
    if (s.outcome === 'completed' && s.finishedAt) {
      events.push({ event: 'flow_completed', flowId: s.flowId })
    }
    for (const enr of s.trainingEnrollments) {
      events.push({ event: 'training_started', trainingId: enr.trainingId })
      // Use completedAt as the source of truth — status can revert to
      // in_progress if the candidate revisits a section after completion.
      if (enr.completedAt) {
        events.push({ event: 'training_completed', trainingId: enr.trainingId })
      }
    }
    for (const m of s.interviewMeetings) {
      if (m.scheduledStart) events.push({ event: 'meeting_scheduled' })
      if (m.actualStart) events.push({ event: 'meeting_started' })
      if (m.actualEnd) events.push({ event: 'meeting_ended' })
    }

    if (events.length === 0) continue

    // Furthest stage in the funnel wins — a candidate who has events for
    // both 'training_completed' (order 3) and 'meeting_scheduled' (order 4)
    // lands in the latter, but we never move them backwards based on a
    // stale earlier-stage event.
    const targetStage = findFurthestStageForEvents(stages, events)
    if (!targetStage || targetStage.id === s.pipelineStatus) continue

    moves.push({
      sessionId: s.id,
      candidateName: s.candidateName ?? s.candidateEmail,
      fromStatus: s.pipelineStatus,
      toStageId: targetStage.id,
      toStageLabel: stageById.get(targetStage.id)?.label ?? targetStage.id,
    })
    byStage[targetStage.id] = (byStage[targetStage.id] ?? 0) + 1
  }

  if (commit && moves.length > 0) {
    // Group updates by toStageId and bulk-update for efficiency.
    const grouped = moves.reduce<Record<string, string[]>>((acc, m) => {
      ;(acc[m.toStageId] ??= []).push(m.sessionId)
      return acc
    }, {})
    await prisma.$transaction(
      Object.entries(grouped).map(([stageId, ids]) =>
        prisma.session.updateMany({
          where: { id: { in: ids }, workspaceId: ws.workspaceId },
          data: { pipelineStatus: stageId },
        }),
      ),
    )
  }

  return NextResponse.json({ moves, byStage, total: moves.length, committed: commit })
}
