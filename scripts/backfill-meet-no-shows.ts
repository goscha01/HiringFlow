/**
 * One-shot backfill for meetings that ended before the host-userId fix
 * (commit 124862f). For each InterviewMeeting with actualEnd != null and no
 * existing meeting_no_show SchedulingEvent, evaluate whether it should have
 * been flagged as a no-show and (in --apply mode) write the missing event,
 * move the candidate to Rejected, and stamp Session.rejectionReason.
 *
 * Deliberately does NOT fire the no-show follow-up email automation. Those
 * emails are time-sensitive and sending them weeks late would confuse
 * candidates — recruiters can manually reach out from the candidate page.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/backfill-meet-no-shows.ts
 *   DATABASE_URL=postgres://... npx tsx scripts/backfill-meet-no-shows.ts --apply
 *
 * Heuristic (when googleUserId is missing on the workspace):
 *   participants.length === 0 → no-show (high confidence)
 *   participants.length === 1 → likely no-show, but flagged "needs review"
 *   participants.length >= 2  → candidate present, skip
 *
 * When googleUserId IS set (post-deploy self-heal has run), we filter out
 * the host by `users/{id}` match — same logic as evaluateNoShow in prod.
 */

import { PrismaClient, Prisma } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient()

type Participant = { email?: string | null; displayName?: string | null }

interface Workspace {
  id: string
  settings: unknown
}

interface FunnelStage {
  id: string
  isBuiltIn?: boolean
  builtInKey?: string
  triggers?: Array<{ event: string; flowId?: string | null; trainingId?: string | null }>
}

function normalizeStages(raw: unknown): FunnelStage[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((s): s is FunnelStage => !!s && typeof s === 'object' && 'id' in s)
}

function findRejectedStage(stages: FunnelStage[]): FunnelStage | null {
  // Match the resolver used by mapLegacyStatusToStageId — built-in 'rejected'.
  return stages.find((s) => s.isBuiltIn && s.builtInKey === 'rejected') || null
}

function findStageForEvent(stages: FunnelStage[], event: string): FunnelStage | null {
  for (const stage of stages) {
    if (!stage.triggers) continue
    for (const t of stage.triggers) {
      if (t.event === event) return stage
    }
  }
  return null
}

function evaluateNoShow(participants: Participant[], hostUserId: string | null): {
  noShow: boolean
  nonHostCount: number
  confidence: 'high' | 'medium' | 'low'
} {
  if (participants.length === 0) {
    return { noShow: true, nonHostCount: 0, confidence: 'high' }
  }
  if (hostUserId) {
    const hostKey = `users/${hostUserId}`
    let nonHost = 0
    for (const p of participants) {
      if (p.email === hostKey) continue
      nonHost++
    }
    return { noShow: nonHost === 0, nonHostCount: nonHost, confidence: 'high' }
  }
  // No hostUserId yet (workspace's next conference.ended will self-heal).
  // Fall back to count-based heuristic.
  if (participants.length === 1) {
    return { noShow: true, nonHostCount: 0, confidence: 'medium' }
  }
  return { noShow: false, nonHostCount: participants.length, confidence: 'high' }
}

async function main() {
  console.log(`[backfill-meet-no-shows] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const meetings = await prisma.interviewMeeting.findMany({
    where: { actualEnd: { not: null } },
    select: {
      id: true,
      workspaceId: true,
      sessionId: true,
      participants: true,
      actualEnd: true,
      session: {
        select: {
          id: true,
          candidateName: true,
          candidateEmail: true,
          pipelineStatus: true,
          rejectionReason: true,
        },
      },
    },
    orderBy: { actualEnd: 'desc' },
  })
  console.log(`[backfill] scanning ${meetings.length} ended meetings`)

  // Pre-load workspace settings + integration host userIds in a couple of queries.
  const workspaceIds = Array.from(new Set(meetings.map((m) => m.workspaceId)))
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: workspaceIds } },
    select: { id: true, settings: true },
  })
  const workspaceById = new Map<string, Workspace>(workspaces.map((w) => [w.id, w as Workspace]))

  const integrations = await prisma.googleIntegration.findMany({
    where: { workspaceId: { in: workspaceIds } },
    select: { workspaceId: true, googleUserId: true },
  })
  const userIdByWorkspace = new Map<string, string | null>(
    integrations.map((i) => [i.workspaceId, i.googleUserId]),
  )

  // Find existing meeting_no_show events to skip.
  const existingNoShow = await prisma.schedulingEvent.findMany({
    where: {
      eventType: 'meeting_no_show',
      sessionId: { in: meetings.map((m) => m.sessionId) },
    },
    select: { metadata: true },
  })
  const skipMeetingIds = new Set<string>()
  for (const ev of existingNoShow) {
    const id = (ev.metadata as Record<string, unknown> | null)?.interviewMeetingId
    if (typeof id === 'string') skipMeetingIds.add(id)
  }

  let detected = 0
  let appliedCount = 0
  let skippedAlreadyFlagged = 0
  let skippedNotNoShow = 0
  const reviewRows: Array<{
    candidate: string | null
    workspaceId: string
    actualEnd: Date | null
    confidence: string
    nonHost: number
  }> = []

  for (const m of meetings) {
    if (skipMeetingIds.has(m.id)) {
      skippedAlreadyFlagged++
      continue
    }
    const participants: Participant[] = Array.isArray(m.participants)
      ? (m.participants as unknown as Participant[])
      : []
    const hostUserId = userIdByWorkspace.get(m.workspaceId) ?? null
    const { noShow, nonHostCount, confidence } = evaluateNoShow(participants, hostUserId)
    if (!noShow) {
      skippedNotNoShow++
      continue
    }
    detected++
    reviewRows.push({
      candidate: m.session.candidateName || m.session.candidateEmail || m.sessionId,
      workspaceId: m.workspaceId,
      actualEnd: m.actualEnd,
      confidence,
      nonHost: nonHostCount,
    })

    if (!APPLY) continue

    // 1. meeting_no_show SchedulingEvent
    await prisma.schedulingEvent.create({
      data: {
        sessionId: m.sessionId,
        eventType: 'meeting_no_show',
        metadata: {
          interviewMeetingId: m.id,
          at: m.actualEnd?.toISOString() ?? new Date().toISOString(),
          nonHostCount,
          backfilled: true,
          confidence,
        } as Prisma.InputJsonValue,
      },
    })

    // 2. Move to Rejected — match applyStageTrigger logic without the runtime import.
    const ws = workspaceById.get(m.workspaceId)
    const stages = normalizeStages((ws?.settings as { funnelStages?: unknown } | null)?.funnelStages)
    const stage = findStageForEvent(stages, 'meeting_no_show') || findRejectedStage(stages)
    await prisma.session.update({
      where: { id: m.sessionId },
      data: {
        pipelineStatus: stage?.id ?? 'rejected',
        rejectionReason: m.session.rejectionReason || 'No-show',
        rejectionReasonAt: new Date(),
      },
    })

    appliedCount++
  }

  console.log(`\n[backfill] no-shows detected: ${detected}`)
  console.log(`[backfill] already flagged (skipped): ${skippedAlreadyFlagged}`)
  console.log(`[backfill] candidate present (skipped): ${skippedNotNoShow}`)

  // Print up to 50 rows so the dry-run is reviewable but doesn't blow up the terminal.
  const preview = reviewRows.slice(0, 50)
  if (preview.length) {
    console.log('\n[backfill] preview (first 50):')
    console.log('candidate'.padEnd(40) + ' | workspace'.padEnd(38) + ' | endedAt'.padEnd(26) + ' | conf'.padEnd(8) + ' | nonHost')
    for (const r of preview) {
      console.log(
        (r.candidate || '').padEnd(40).slice(0, 40) +
        ' | ' + r.workspaceId.padEnd(36) +
        ' | ' + (r.actualEnd?.toISOString() ?? '').padEnd(24) +
        ' | ' + r.confidence.padEnd(6) +
        ' | ' + r.nonHost,
      )
    }
    if (reviewRows.length > 50) {
      console.log(`...and ${reviewRows.length - 50} more`)
    }
  }

  if (APPLY) {
    console.log(`\n[backfill] APPLIED: ${appliedCount} meetings`)
  } else {
    console.log(`\n[backfill] dry-run only — re-run with --apply to mutate`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
