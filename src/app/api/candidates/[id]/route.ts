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
        include: { training: { select: { id: true, title: true } } },
      },
      schedulingEvents: { orderBy: { eventAt: 'desc' } },
    },
  })

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  return NextResponse.json({ ...session, automationExecutions, formFieldLabels, isRebook })
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
