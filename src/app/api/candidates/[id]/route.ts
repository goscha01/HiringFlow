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
          id: true, name: true, triggerType: true, nextStepType: true, emailDestination: true,
          emailDestinationAddress: true, delayMinutes: true,
          training: { select: { title: true, slug: true } },
          schedulingConfig: { select: { name: true, schedulingUrl: true } },
          emailTemplate: { select: { name: true, subject: true } },
          chainedBy: { select: { id: true, name: true, delayMinutes: true } },
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

  return NextResponse.json({ ...session, automationExecutions, formFieldLabels })
}

// Update pipeline status
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { pipelineStatus, outcome } = await request.json()

  const data: Record<string, unknown> = {}
  if (pipelineStatus !== undefined) data.pipelineStatus = pipelineStatus
  if (outcome !== undefined) data.outcome = outcome

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

  return NextResponse.json({ id: updated.id, pipelineStatus: updated.pipelineStatus, outcome: updated.outcome })
}

// Delete a candidate (Session) and all owned records.
// Cascades handle: SessionAnswer, CandidateSubmission, SchedulingEvent, InterviewMeeting.
// Non-cascading FKs (TrainingEnrollment.sessionId, TrainingAccessToken.candidateId,
// AICall.sessionId) and the FK-less AutomationExecution.sessionId are cleaned up
// explicitly so the delete doesn't fail and we don't leave orphan rows.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: { id: true },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.aICall.updateMany({ where: { sessionId: params.id }, data: { sessionId: null } }),
    prisma.trainingEnrollment.deleteMany({ where: { sessionId: params.id } }),
    prisma.trainingAccessToken.deleteMany({ where: { candidateId: params.id } }),
    prisma.automationExecution.deleteMany({ where: { sessionId: params.id } }),
    prisma.session.delete({ where: { id: params.id } }),
  ])

  return NextResponse.json({ success: true })
}
