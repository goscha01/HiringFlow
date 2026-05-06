import { prisma } from './prisma'
import type { CandidateStatus, CandidateDispositionReason } from './candidate-status'

export interface DateFilter {
  from?: Date
  to?: Date
}

function dateWhere(filter?: DateFilter) {
  if (!filter?.from && !filter?.to) return {}
  return {
    startedAt: {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    },
  }
}

/**
 * Funnel metrics — session-based counts through each pipeline stage.
 */
export async function getFunnelMetrics(workspaceId: string, filter?: DateFilter) {
  const where = { workspaceId, ...dateWhere(filter) }

  const [
    started,
    completed,
    passed,
    trainingStarted,
    trainingCompleted,
    invitedToSchedule,
    scheduled,
  ] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.count({ where: { ...where, outcome: { in: ['completed', 'passed'] } } }),
    prisma.session.count({ where: { ...where, outcome: 'passed' } }),
    prisma.session.count({ where: { ...where, pipelineStatus: { in: ['training_in_progress', 'training_completed', 'invited_to_schedule', 'scheduled'] } } }),
    prisma.session.count({ where: { ...where, pipelineStatus: { in: ['training_completed', 'invited_to_schedule', 'scheduled'] } } }),
    prisma.session.count({ where: { ...where, pipelineStatus: { in: ['invited_to_schedule', 'scheduled'] } } }),
    prisma.session.count({ where: { ...where, pipelineStatus: 'scheduled' } }),
  ])

  return { started, completed, passed, trainingStarted, trainingCompleted, invitedToSchedule, scheduled }
}

/**
 * Source metrics — grouped by session.source (from Ad attribution or direct).
 */
export async function getSourceMetrics(workspaceId: string, filter?: DateFilter) {
  const where = { workspaceId, ...dateWhere(filter) }

  const sessions = await prisma.session.groupBy({
    by: ['source'],
    where,
    _count: true,
  })

  // For each source, get detailed breakdown
  const sources = Array.from(new Set(sessions.map(s => s.source || 'direct')))

  const metrics = await Promise.all(
    sources.map(async (source) => {
      const sourceWhere = { ...where, source: source === 'direct' ? null : source }

      const [started, completed, passed, trainingCompleted, invitedToSchedule, scheduled] = await Promise.all([
        prisma.session.count({ where: sourceWhere }),
        prisma.session.count({ where: { ...sourceWhere, outcome: { in: ['completed', 'passed'] } } }),
        prisma.session.count({ where: { ...sourceWhere, outcome: 'passed' } }),
        prisma.session.count({ where: { ...sourceWhere, pipelineStatus: { in: ['training_completed', 'invited_to_schedule', 'scheduled'] } } }),
        prisma.session.count({ where: { ...sourceWhere, pipelineStatus: { in: ['invited_to_schedule', 'scheduled'] } } }),
        prisma.session.count({ where: { ...sourceWhere, pipelineStatus: 'scheduled' } }),
      ])

      return { source, started, completed, passed, trainingCompleted, invitedToSchedule, scheduled }
    })
  )

  return metrics.sort((a, b) => b.started - a.started)
}

/**
 * Ad metrics — grouped by ad, with per-ad funnel breakdown.
 */
export async function getAdMetrics(workspaceId: string, filter?: DateFilter) {
  const ads = await prisma.ad.findMany({
    where: { workspaceId },
    select: { id: true, name: true, source: true, slug: true },
    orderBy: { createdAt: 'desc' },
  })

  const dateFilter = dateWhere(filter)

  const metrics = await Promise.all(
    ads.map(async (ad) => {
      const adWhere = { workspaceId, adId: ad.id, ...dateFilter }

      const [started, completed, passed, trainingCompleted, invitedToSchedule, scheduled] = await Promise.all([
        prisma.session.count({ where: adWhere }),
        prisma.session.count({ where: { ...adWhere, outcome: { in: ['completed', 'passed'] } } }),
        prisma.session.count({ where: { ...adWhere, outcome: 'passed' } }),
        prisma.session.count({ where: { ...adWhere, pipelineStatus: { in: ['training_completed', 'invited_to_schedule', 'scheduled'] } } }),
        prisma.session.count({ where: { ...adWhere, pipelineStatus: { in: ['invited_to_schedule', 'scheduled'] } } }),
        prisma.session.count({ where: { ...adWhere, pipelineStatus: 'scheduled' } }),
      ])

      return {
        adId: ad.id,
        adName: ad.name,
        source: ad.source,
        started,
        completed,
        passed,
        trainingCompleted,
        invitedToSchedule,
        scheduled,
      }
    })
  )

  // Also add "Direct" (no ad) entry
  const directWhere = { workspaceId, adId: null as string | null, ...dateFilter }
  const [dStarted, dCompleted, dPassed, dTrainingCompleted, dInvited, dScheduled] = await Promise.all([
    prisma.session.count({ where: directWhere }),
    prisma.session.count({ where: { ...directWhere, outcome: { in: ['completed', 'passed'] } } }),
    prisma.session.count({ where: { ...directWhere, outcome: 'passed' } }),
    prisma.session.count({ where: { ...directWhere, pipelineStatus: { in: ['training_completed', 'invited_to_schedule', 'scheduled'] } } }),
    prisma.session.count({ where: { ...directWhere, pipelineStatus: { in: ['invited_to_schedule', 'scheduled'] } } }),
    prisma.session.count({ where: { ...directWhere, pipelineStatus: 'scheduled' } }),
  ])

  if (dStarted > 0) {
    metrics.push({
      adId: 'direct',
      adName: 'Direct (no ad)',
      source: 'direct',
      started: dStarted,
      completed: dCompleted,
      passed: dPassed,
      trainingCompleted: dTrainingCompleted,
      invitedToSchedule: dInvited,
      scheduled: dScheduled,
    })
  }

  return metrics.sort((a, b) => b.started - a.started)
}

/**
 * Status-axis metrics — counts by `Session.status` and the breakdowns of
 * `dispositionReason` for the stalled / lost buckets. Lets analytics
 * distinguish "stuck but recoverable" (stalled) from "true terminal loss"
 * (lost) without parsing free-form rejectionReason strings.
 *
 * `reactivated` = candidates whose `stalledAt` is non-null but whose current
 * status is back to active/waiting/hired — proves the cron-flag-then-recover
 * loop is working.
 *
 * `dropOffByStage` is intentionally NOT in this function; it's the existing
 * funnel cliff (the difference between consecutive `getFunnelMetrics`
 * stages). Analytics UI computes that client-side from the funnel data.
 */
export async function getStatusMetrics(workspaceId: string, filter?: DateFilter) {
  const where = { workspaceId, ...dateWhere(filter) }

  const [byStatus, lostByReason, stalledByReason, reactivated] = await Promise.all([
    prisma.session.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    prisma.session.groupBy({
      by: ['dispositionReason'],
      where: { ...where, status: 'lost' },
      _count: { _all: true },
    }),
    prisma.session.groupBy({
      by: ['dispositionReason'],
      where: { ...where, status: 'stalled' },
      _count: { _all: true },
    }),
    prisma.session.count({
      where: {
        ...where,
        stalledAt: { not: null },
        status: { in: ['active', 'waiting', 'hired'] },
      },
    }),
  ])

  // Normalize into typed records — the groupBy result has `_count` shaped
  // as `{ _all: number }` and the `by` columns are nullable strings, so
  // pre-shape the response for predictable client consumption.
  const statusCounts: Record<CandidateStatus, number> = {
    active: 0, waiting: 0, stalled: 0, nurture: 0, lost: 0, hired: 0,
  }
  for (const row of byStatus) {
    const k = row.status as CandidateStatus
    if (k in statusCounts) statusCounts[k] = row._count._all
  }

  const buildReasonMap = (rows: typeof lostByReason) => {
    const out: Record<string, number> = {}
    for (const row of rows) {
      const k = (row.dispositionReason ?? 'manual_other') as CandidateDispositionReason | 'manual_other'
      out[k] = (out[k] ?? 0) + row._count._all
    }
    return out
  }

  return {
    byStatus: statusCounts,
    lostByReason: buildReasonMap(lostByReason),
    stalledByReason: buildReasonMap(stalledByReason),
    reactivated,
  }
}
