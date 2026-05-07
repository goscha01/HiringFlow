import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSchedulingEvent } from '@/lib/scheduling'
import { recordPipelineStatusChange } from '@/lib/pipeline-status'
import {
  isCandidateStatus,
  isDispositionReason,
  statusTransitionPatch,
  type CandidateDispositionReason,
} from '@/lib/candidate-status'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    include: {
      flow: { select: { id: true, name: true, slug: true } },
      // Step the candidate is currently sitting on. Drives the "Step X of Y"
      // progress card on the dashboard. Null once the flow is finished.
      lastStep: { select: { id: true, title: true, stepOrder: true, stepType: true, questionType: true } },
      ad: { select: { id: true, name: true, source: true } },
      answers: {
        include: {
          step: { select: { id: true, title: true, questionText: true, stepType: true, questionType: true } },
          option: { select: { id: true, optionText: true } },
        },
        orderBy: { answeredAt: 'asc' },
      },
      submissions: {
        include: {
          step: { select: { id: true, title: true, questionText: true } },
        },
        orderBy: { submittedAt: 'asc' },
      },
      trainingEnrollments: {
        include: {
          training: {
            select: {
              id: true,
              title: true,
              // Section list lets us render "2 of 5 — currently on
              // <name>" and label per-section timeline events. Includes
              // each section's content rows so the card can compute
              // "Lesson 3 of 4" from the candidate's currentLesson ping.
              // We pull only ids here — counting client-side keeps the
              // payload small and avoids a separate aggregate query.
              sections: {
                select: {
                  id: true,
                  title: true,
                  sortOrder: true,
                  kind: true,
                  contents: { select: { id: true, type: true }, orderBy: { sortOrder: 'asc' } },
                },
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      },
      schedulingEvents: { orderBy: { eventAt: 'desc' } },
    },
  })

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Total step count for the flow — used to render the candidate's flow
  // progress as "Step 3 / 8". Counted once and serialized into the response.
  const flowStepCount = session.flow?.id
    ? await prisma.flowStep.count({ where: { flowId: session.flow.id } })
    : 0

  const automationExecutions = await prisma.automationExecution.findMany({
    where: { sessionId: params.id },
    include: {
      automationRule: {
        select: {
          id: true, name: true, triggerType: true,
          chainedBy: { select: { id: true, name: true, steps: { orderBy: { order: 'asc' }, select: { delayMinutes: true } } } },
        },
      },
      step: {
        select: {
          id: true, order: true, channel: true, delayMinutes: true,
          nextStepType: true, emailDestination: true, emailDestinationAddress: true,
          training: { select: { title: true, slug: true } },
          schedulingConfig: { select: { name: true, schedulingUrl: true } },
          emailTemplate: { select: { name: true, subject: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Resolve form field labels from the flow's form steps so the candidate page
  // can render `Address` instead of `custom_1775512958533`. A flow may have
  // multiple form steps; we merge their fields into one label map keyed by id.
  const formFieldLabels: Record<string, string> = {}
  if (session.flow?.id) {
    const formSteps = await prisma.flowStep.findMany({
      where: { flowId: session.flow.id, formEnabled: true },
      select: { formConfig: true },
    })
    for (const s of formSteps) {
      const cfg = s.formConfig as { fields?: Array<{ id?: string; label?: string }> } | null
      for (const f of cfg?.fields || []) {
        if (f?.id && f?.label) formFieldLabels[f.id] = f.label
      }
    }
  }

  // Pull every other Session for this candidate (matched by email,
  // case-insensitive — the same dedupe key the candidates list uses) so the
  // detail page can surface "this person also has X other application(s)".
  // The previous implementation only computed an `isRebook` boolean here,
  // which meant the UI had no way to link out to the sibling — recruiters
  // could end up looking at a stale older session without realising a
  // current one existed (Stephanie Descofleur, 2026-05-06).
  type SiblingSession = {
    id: string
    startedAt: string
    finishedAt: string | null
    pipelineStatus: string | null
    status: string
    dispositionReason: string | null
    rejectionReason: string | null
    flowName: string | null
    hadNoShow: boolean
  }
  let siblingSessions: SiblingSession[] = []
  let isRebook = false
  if (session.candidateEmail) {
    const siblings = await prisma.session.findMany({
      where: {
        workspaceId: ws.workspaceId,
        candidateEmail: { equals: session.candidateEmail, mode: 'insensitive' },
        id: { not: session.id },
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
        pipelineStatus: true,
        status: true,
        dispositionReason: true,
        rejectionReason: true,
        flow: { select: { name: true } },
        schedulingEvents: {
          where: { eventType: 'meeting_no_show' },
          select: { id: true },
          take: 1,
        },
      },
    })
    siblingSessions = siblings.map((s) => ({
      id: s.id,
      startedAt: s.startedAt.toISOString(),
      finishedAt: s.finishedAt?.toISOString() ?? null,
      pipelineStatus: s.pipelineStatus,
      status: s.status,
      dispositionReason: s.dispositionReason,
      rejectionReason: s.rejectionReason,
      flowName: s.flow?.name ?? null,
      hadNoShow: s.schedulingEvents.length > 0,
    }))
    // Same definition as before: a session is a "rebook" iff there is an
    // earlier sibling that had a meeting_no_show.
    isRebook = siblings.some(
      (s) => s.startedAt < session.startedAt && s.schedulingEvents.length > 0,
    )
  }

  // Effective "last activity" — derived from every event timestamp we know
  // about, not just Session.lastActivityAt. The heartbeat field was added
  // mid-flight, so existing candidates whose recent engagement was a meeting
  // or an automation-driven training visit don't have it populated. Computing
  // the max here means recruiters see "Last active 2h ago" the moment those
  // events exist, without needing to backfill the column.
  //
  // Sources:
  //   - Session.lastActivityAt (the new heartbeat)
  //   - Most recent SessionAnswer / CandidateSubmission / SchedulingEvent
  //   - Most recent InterviewMeeting actualStart/actualEnd (the candidate
  //     was actually in the meeting)
  //   - Most recent TrainingEnrollment startedAt/completedAt + currentLesson.at
  //   - Most recent AutomationExecution sentAt (system activity, not
  //     candidate activity, so weighted lower in label only)
  const interviewMeetings = await prisma.interviewMeeting.findMany({
    where: { sessionId: params.id },
    select: { actualStart: true, actualEnd: true, scheduledStart: true },
    orderBy: { scheduledStart: 'desc' },
  })

  const candidateActivityCandidates: Array<Date | null | undefined> = [
    session.lastActivityAt,
    session.finishedAt,
    ...session.answers.map((a) => a.answeredAt),
    ...session.submissions.map((s) => s.submittedAt),
    ...session.schedulingEvents.map((e) => e.eventAt),
    ...interviewMeetings.flatMap((m) => [m.actualStart, m.actualEnd]),
    ...session.trainingEnrollments.flatMap((e) => [e.startedAt, e.completedAt]),
    ...session.trainingEnrollments.flatMap((e) => {
      const p = e.progress as { sectionTimestamps?: Record<string, string>; currentLesson?: { at: string } } | null
      const stamps = Object.values(p?.sectionTimestamps || {}).map((s) => new Date(s))
      const cl = p?.currentLesson?.at ? [new Date(p.currentLesson.at)] : []
      return [...stamps, ...cl]
    }),
  ]
  const effectiveLastActivityAt = candidateActivityCandidates
    .filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()))
    .reduce<Date | null>((best, d) => (best == null || d.getTime() > best.getTime() ? d : best), null)

  return NextResponse.json({
    ...session,
    automationExecutions,
    formFieldLabels,
    isRebook,
    siblingSessions,
    flowStepCount,
    effectiveLastActivityAt: effectiveLastActivityAt?.toISOString() ?? null,
  })
}

// Update pipeline status. Accepts the legacy fields (pipelineStatus / outcome
// / rejectionReason) and the new status-axis fields (status / dispositionReason).
//
// Manual lifecycle actions are expressed as a `status` transition:
//   markAsStalled(reason) → PATCH { status: 'stalled', dispositionReason: reason }
//   markAsLost(reason)    → PATCH { status: 'lost',    dispositionReason: reason }
//   markAsNurture(reason) → PATCH { status: 'nurture', dispositionReason: reason? }
//   markAsHired()         → PATCH { status: 'hired' }
//   reactivate()          → PATCH { status: 'active' }
//
// statusTransitionPatch() handles the `*At` stamps and clears `dispositionReason`
// on reactivate, so callers don't need to remember the bookkeeping rules.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json()) as {
    pipelineStatus?: string
    outcome?: string
    rejectionReason?: string | null
    status?: string
    dispositionReason?: string | null
  }
  const { pipelineStatus, outcome, rejectionReason, status, dispositionReason } = body

  const data: Record<string, unknown> = {}
  if (pipelineStatus !== undefined) data.pipelineStatus = pipelineStatus
  if (outcome !== undefined) data.outcome = outcome
  if (rejectionReason !== undefined) {
    // Empty string clears the reason; non-empty stamps the timestamp
    const trimmed = typeof rejectionReason === 'string' ? rejectionReason.trim() : null
    data.rejectionReason = trimmed && trimmed.length > 0 ? trimmed : null
    data.rejectionReasonAt = trimmed && trimmed.length > 0 ? new Date() : null
  }

  if (status !== undefined) {
    if (!isCandidateStatus(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
    }
    // Validate disposition reason if provided. `null` is allowed to clear.
    let dispArg: CandidateDispositionReason | null | undefined
    if (dispositionReason !== undefined) {
      if (dispositionReason === null || dispositionReason === '') {
        dispArg = null
      } else if (isDispositionReason(dispositionReason)) {
        dispArg = dispositionReason
      } else {
        return NextResponse.json(
          { error: `Invalid dispositionReason: ${dispositionReason}` },
          { status: 400 },
        )
      }
    }
    Object.assign(data, statusTransitionPatch(status, { dispositionReason: dispArg }))
  } else if (dispositionReason !== undefined) {
    // dispositionReason can be edited without changing the status
    // (e.g. recruiter recategorising a stalled candidate's reason).
    if (dispositionReason === null || dispositionReason === '') {
      data.dispositionReason = null
    } else if (isDispositionReason(dispositionReason)) {
      data.dispositionReason = dispositionReason
    } else {
      return NextResponse.json(
        { error: `Invalid dispositionReason: ${dispositionReason}` },
        { status: 400 },
      )
    }
  }

  const updated = await prisma.session.update({
    where: { id: params.id },
    data,
  })

  // Audit pipelineStatus changes from the manual PATCH surface (kanban drag,
  // pipeline buttons, outcome flip — all funnel through this endpoint).
  // The original `session` snapshot above holds the pre-update value.
  if (pipelineStatus !== undefined && session.pipelineStatus !== updated.pipelineStatus) {
    await recordPipelineStatusChange({
      sessionId: params.id,
      fromStatus: session.pipelineStatus,
      toStatus: updated.pipelineStatus ?? '',
      source: 'manual:patch',
      triggeredBy: ws.userId,
      metadata: outcome !== undefined ? { outcome } : undefined,
    })
  }

  // Log scheduling event if marking as scheduled
  if (pipelineStatus === 'scheduled') {
    await logSchedulingEvent({
      sessionId: params.id,
      eventType: 'marked_scheduled',
      metadata: { markedBy: ws.userId },
    }).catch(() => {})
  }

  return NextResponse.json({
    id: updated.id,
    pipelineStatus: updated.pipelineStatus,
    outcome: updated.outcome,
    rejectionReason: updated.rejectionReason,
    rejectionReasonAt: updated.rejectionReasonAt,
    status: updated.status,
    dispositionReason: updated.dispositionReason,
    stalledAt: updated.stalledAt,
    lostAt: updated.lostAt,
    hiredAt: updated.hiredAt,
  })
}

// Delete a candidate. The candidates list dedupes Session rows by email
// (one card per person), so deleting only the visible row would leave older
// applications by the same person in the DB and they'd reappear after refresh.
// We delete every Session for that email in the workspace. If the row has no
// email we can't identify "same person" — fall back to deleting just that row.
// Cascades handle: SessionAnswer, CandidateSubmission, SchedulingEvent, InterviewMeeting.
// Non-cascading FKs (TrainingEnrollment.sessionId, TrainingAccessToken.candidateId,
// AICall.sessionId) and the FK-less AutomationExecution.sessionId are cleaned up
// explicitly so the delete doesn't fail and we don't leave orphan rows.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: { id: true, candidateEmail: true },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const email = session.candidateEmail?.trim() || null
  const sessionIds: string[] = email
    ? (await prisma.session.findMany({
        where: {
          workspaceId: ws.workspaceId,
          candidateEmail: { equals: email, mode: 'insensitive' },
        },
        select: { id: true },
      })).map((s) => s.id)
    : [session.id]

  await prisma.$transaction([
    prisma.aICall.updateMany({ where: { sessionId: { in: sessionIds } }, data: { sessionId: null } }),
    prisma.trainingEnrollment.deleteMany({ where: { sessionId: { in: sessionIds } } }),
    prisma.trainingAccessToken.deleteMany({ where: { candidateId: { in: sessionIds } } }),
    prisma.automationExecution.deleteMany({ where: { sessionId: { in: sessionIds } } }),
    prisma.session.deleteMany({ where: { id: { in: sessionIds } } }),
  ])

  return NextResponse.json({ success: true, deletedCount: sessionIds.length })
}
