import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  findFurthestStageForEvents,
  mapLegacyStatusToStageId,
  normalizeStages,
  type FunnelStage,
  type StageTriggerEvent,
} from '@/lib/funnel-stages'
import { recordPipelineStatusChange } from '@/lib/pipeline-status'
import { excludeTestSessions } from '@/lib/session-filters'

interface SessionEvent {
  event: StageTriggerEvent
  flowId?: string
  trainingId?: string
}

/**
 * Re-applies funnel stage triggers to all existing candidates in the
 * workspace. Walks each session's event history (flow outcome, training
 * enrollments, interview meetings, scheduling events) and finds the most
 * recent event that matches a configured trigger — that stage's id becomes
 * the candidate's new pipeline_status.
 *
 * Body: { commit?: boolean }   commit defaults to false (dry-run). When
 * false, only returns the diff so the UI can show a confirmation. When
 * true, writes the new pipeline_status values.
 *
 * Guarantees that this routine NEVER regresses a candidate:
 *   - Synthesizes `meeting_no_show` / `meeting_cancelled` events from
 *     SchedulingEvent (and the legacy `Session.rejectionReason='No-show'`
 *     marker), so the destination computation considers no-shows the way
 *     the live runtime does.
 *   - For meetings that produced a `meeting_no_show` event, suppresses the
 *     synthesized `meeting_started` / `meeting_ended` derived from
 *     `actualStart` / `actualEnd` columns. The Meet API often fills those
 *     in even when the candidate didn't actually attend (e.g. host-only
 *     join), so a no-show meeting that has `actualEnd` set should not
 *     count as a successful "meeting ended" event for stage purposes.
 *   - Compares the resolved target stage against the candidate's current
 *     pipelineStatus order before moving — i.e. the same furthest-wins
 *     guard the live runtime enforces. Without this, a candidate sitting
 *     in `rejected` (order 9) could be silently dragged back to `Meeting`
 *     (order 3) on the next backfill pass. (Stephanie Descofleur,
 *     2026-05-06.)
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
    // Test-source sessions never participate in backfill — they're seeded
    // with synthetic pipelineStatus/outcome by the automations test endpoint
    // and would otherwise be moved to whatever stage matches their seeded
    // event surface.
    where: { workspaceId: ws.workspaceId, ...excludeTestSessions() },
    select: {
      id: true,
      candidateName: true,
      candidateEmail: true,
      pipelineStatus: true,
      outcome: true,
      finishedAt: true,
      flowId: true,
      rejectionReason: true,
      trainingEnrollments: {
        select: { trainingId: true, status: true, startedAt: true, completedAt: true },
      },
      interviewMeetings: {
        select: { id: true, scheduledStart: true, actualStart: true, actualEnd: true },
      },
      // We only need the negative-outcome events for synthesis. Positive
      // events (started/ended/scheduled) are derived from InterviewMeeting
      // columns; pulling them again from SchedulingEvent would double-count.
      schedulingEvents: {
        where: { eventType: { in: ['meeting_no_show', 'meeting_cancelled'] } },
        select: { eventType: true, metadata: true },
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

    // Build the set of meeting ids that are known to have ended in a no-show
    // (so we can suppress the meeting_started/ended derivations for those
    // meetings — the Meet API can fill in actualStart/actualEnd even when
    // the candidate didn't actually attend).
    const noShowMeetingIds = new Set<string>()
    let hasMeetingNoShow = false
    let hasMeetingCancelled = false
    for (const ev of s.schedulingEvents) {
      if (ev.eventType === 'meeting_no_show') {
        hasMeetingNoShow = true
        const meetingId = (ev.metadata as { interviewMeetingId?: string } | null)?.interviewMeetingId
        if (typeof meetingId === 'string') noShowMeetingIds.add(meetingId)
      } else if (ev.eventType === 'meeting_cancelled') {
        hasMeetingCancelled = true
      }
    }
    // Legacy signal — older sessions stamped `rejectionReason='No-show'`
    // before the meeting_no_show SchedulingEvent existed. Treat as a no-show
    // even if no event row exists.
    if (s.rejectionReason === 'No-show') hasMeetingNoShow = true

    for (const m of s.interviewMeetings) {
      if (m.scheduledStart) events.push({ event: 'meeting_scheduled' })
      if (noShowMeetingIds.has(m.id)) continue
      if (m.actualStart) events.push({ event: 'meeting_started' })
      if (m.actualEnd) events.push({ event: 'meeting_ended' })
    }

    if (hasMeetingNoShow) events.push({ event: 'meeting_no_show' })
    if (hasMeetingCancelled) events.push({ event: 'meeting_cancelled' })

    if (events.length === 0) continue

    // Furthest stage in the funnel wins — a candidate who has events for
    // both 'training_completed' (order 3) and 'meeting_scheduled' (order 4)
    // lands in the latter, but we never move them backwards based on a
    // stale earlier-stage event.
    const targetStage = findFurthestStageForEvents(stages, events)
    if (!targetStage || targetStage.id === s.pipelineStatus) continue

    // Same guard the live runtime enforces: a backfill pass must NEVER
    // regress a candidate. Resolve the candidate's current pipelineStatus
    // against the funnel order — if the synthesized target is earlier,
    // skip. This catches:
    //   - manually-rejected candidates whose meetings have actualEnd set
    //   - candidates moved forward by a later automation that the synthesis
    //     can't reproduce (e.g. background_check_passed)
    const currentOrder = resolveOrder(stages, s.pipelineStatus)
    if (currentOrder !== null && targetStage.order < currentOrder) continue

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
    // Audit each move so we can prove it was the backfill (and not a
    // recruiter) the next time someone asks "who moved this candidate?".
    // Fired after the bulk update so a slow audit insert never blocks the
    // user-visible write. Failures are logged inside the helper.
    await Promise.all(
      moves.map((m) =>
        recordPipelineStatusChange({
          sessionId: m.sessionId,
          fromStatus: m.fromStatus,
          toStatus: m.toStageId,
          source: 'backfill',
          triggeredBy: ws.userId ?? null,
        }),
      ),
    )
  }

  return NextResponse.json({ moves, byStage, total: moves.length, committed: commit })
}

function resolveOrder(stages: FunnelStage[], pipelineStatus: string | null): number | null {
  if (!pipelineStatus) return null
  const direct = stages.find((s) => s.id === pipelineStatus)
  if (direct) return direct.order
  const mapped = mapLegacyStatusToStageId(pipelineStatus)
  const fallback = stages.find((s) => s.id === mapped)
  return fallback ? fallback.order : null
}
