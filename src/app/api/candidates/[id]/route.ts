import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSchedulingEvent } from '@/lib/scheduling'

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

  // A session is a "rebook" if the same candidate (by email) has an earlier
  // session in the workspace with a meeting_no_show event — i.e. they took
  // the no-show follow-up invite and started over.
  let isRebook = false
  if (session.candidateEmail) {
    const earlier = await prisma.session.findFirst({
      where: {
        workspaceId: ws.workspaceId,
        candidateEmail: session.candidateEmail,
        startedAt: { lt: session.startedAt },
        schedulingEvents: { some: { eventType: 'meeting_no_show' } },
      },
      select: { id: true },
    })
    isRebook = !!earlier
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
    flowStepCount,
    effectiveLastActivityAt: effectiveLastActivityAt?.toISOString() ?? null,
  })
}

// Update pipeline status
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { pipelineStatus, outcome, rejectionReason } = await request.json()

  const data: Record<string, unknown> = {}
  if (pipelineStatus !== undefined) data.pipelineStatus = pipelineStatus
  if (outcome !== undefined) data.outcome = outcome
  if (rejectionReason !== undefined) {
    // Empty string clears the reason; non-empty stamps the timestamp
    const trimmed = typeof rejectionReason === 'string' ? rejectionReason.trim() : null
    data.rejectionReason = trimmed && trimmed.length > 0 ? trimmed : null
    data.rejectionReasonAt = trimmed && trimmed.length > 0 ? new Date() : null
  }

  const updated = await prisma.session.update({
    where: { id: params.id },
    data,
  })

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
