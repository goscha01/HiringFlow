import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface StepInput {
  order?: number
  delayMinutes?: number
  timingMode?: 'trigger' | 'before_meeting' | 'after_meeting'
  channel?: 'email' | 'sms' | 'both'
  emailTemplateId?: string | null
  smsBody?: string | null
  emailDestination?: 'applicant' | 'company' | 'specific'
  emailDestinationAddress?: string | null
  nextStepType?: string | null
  nextStepUrl?: string | null
  trainingId?: string | null
  schedulingConfigId?: string | null
}

function validateSteps(steps: unknown): { ok: true; steps: StepInput[] } | { ok: false; error: string } {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { ok: false, error: 'At least one step is required' }
  }
  const out: StepInput[] = []
  for (let i = 0; i < steps.length; i++) {
    const raw = steps[i] as StepInput
    if (!raw || typeof raw !== 'object') return { ok: false, error: `Step ${i + 1} is malformed` }
    const channel: 'email' | 'sms' | 'both' = raw.channel === 'sms' ? 'sms' : raw.channel === 'both' ? 'both' : 'email'
    const wantsEmail = channel === 'email' || channel === 'both'
    const wantsSms = channel === 'sms' || channel === 'both'
    if (wantsEmail && !raw.emailTemplateId) return { ok: false, error: `Step ${i + 1}: email channel requires an email template` }
    if (wantsSms && (!raw.smsBody || raw.smsBody.trim().length === 0)) return { ok: false, error: `Step ${i + 1}: SMS channel requires a body` }
    const delayMinutes = Number.isFinite(raw.delayMinutes) ? Math.max(0, Math.floor(raw.delayMinutes as number)) : 0
    out.push({
      order: i,
      delayMinutes,
      timingMode: (raw.timingMode === 'before_meeting' || raw.timingMode === 'after_meeting') ? raw.timingMode : 'trigger',
      channel,
      emailTemplateId: wantsEmail ? raw.emailTemplateId ?? null : null,
      smsBody: wantsSms ? raw.smsBody ?? null : null,
      emailDestination: raw.emailDestination ?? 'applicant',
      emailDestinationAddress: raw.emailDestination === 'specific' ? (raw.emailDestinationAddress || null) : null,
      nextStepType: raw.nextStepType || null,
      nextStepUrl: raw.nextStepUrl || null,
      trainingId: raw.trainingId || null,
      schedulingConfigId: raw.schedulingConfigId || null,
    })
  }
  return { ok: true, steps: out }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()
  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json()

  // If `steps` was sent, replace the rule's full step set. We don't try to
  // diff per-step in the API — the editor always submits the whole sequence.
  // Pending QStash messages keyed off the OLD step IDs become orphans; the
  // executor's "step not found" branch turns them into no-ops.
  let validatedSteps: StepInput[] | null = null
  if (body.steps !== undefined) {
    const v = validateSteps(body.steps)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    validatedSteps = v.steps
  }

  // For any step that points to a training, switch the training to invitation_only
  if (validatedSteps) {
    const trainingIds = validatedSteps
      .filter((s) => s.nextStepType === 'training' && s.trainingId)
      .map((s) => s.trainingId as string)
    if (trainingIds.length > 0) {
      await prisma.training.updateMany({
        where: { id: { in: trainingIds }, workspaceId: ws.workspaceId },
        data: { accessMode: 'invitation_only' },
      })
    }
  }

  // Apply rule-level fields + (optionally) replace steps in a single transaction.
  await prisma.$transaction(async (tx) => {
    const firstStep = validatedSteps?.[0]
    await tx.automationRule.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.triggerType !== undefined && { triggerType: body.triggerType }),
        ...(body.flowId !== undefined && { flowId: body.flowId || null }),
        ...(body.triggerAutomationId !== undefined && { triggerAutomationId: body.triggerAutomationId || null }),
        ...(body.minutesBefore !== undefined && {
          minutesBefore: Number.isInteger(body.minutesBefore) && body.minutesBefore > 0 ? body.minutesBefore : null,
        }),
        ...(body.waitForRecording !== undefined && { waitForRecording: !!body.waitForRecording }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        // Mirror the first step's send config onto the legacy rule columns so
        // any read path not yet on `steps` keeps working until the columns
        // are dropped in a follow-up PR.
        ...(firstStep && {
          channel: firstStep.channel === 'both' ? 'email' : firstStep.channel ?? 'email',
          emailTemplateId: firstStep.emailTemplateId ?? null,
          smsBody: firstStep.smsBody ?? null,
          nextStepType: firstStep.nextStepType ?? null,
          nextStepUrl: firstStep.nextStepUrl ?? null,
          trainingId: firstStep.trainingId ?? null,
          schedulingConfigId: firstStep.schedulingConfigId ?? null,
          delayMinutes: firstStep.delayMinutes ?? 0,
          emailDestination: firstStep.emailDestination ?? 'applicant',
          emailDestinationAddress: firstStep.emailDestinationAddress ?? null,
        }),
      },
    })
    if (validatedSteps) {
      await tx.automationStep.deleteMany({ where: { ruleId: params.id } })
      await tx.automationStep.createMany({
        data: validatedSteps.map((s, i) => ({
          ruleId: params.id,
          order: i,
          delayMinutes: s.delayMinutes ?? 0,
          timingMode: s.timingMode ?? 'trigger',
          channel: s.channel ?? 'email',
          emailTemplateId: s.emailTemplateId ?? null,
          smsBody: s.smsBody ?? null,
          emailDestination: s.emailDestination ?? 'applicant',
          emailDestinationAddress: s.emailDestinationAddress ?? null,
          nextStepType: s.nextStepType ?? null,
          nextStepUrl: s.nextStepUrl ?? null,
          trainingId: s.trainingId ?? null,
          schedulingConfigId: s.schedulingConfigId ?? null,
        })),
      })
    }
  })

  const updated = await prisma.automationRule.findUnique({
    where: { id: params.id },
    include: {
      flow: { select: { id: true, name: true } },
      emailTemplate: { select: { id: true, name: true, subject: true } },
      training: { select: { id: true, title: true, slug: true } },
      schedulingConfig: { select: { id: true, name: true, schedulingUrl: true } },
      steps: {
        orderBy: { order: 'asc' },
        include: {
          emailTemplate: { select: { id: true, name: true, subject: true } },
          training: { select: { id: true, title: true, slug: true } },
          schedulingConfig: { select: { id: true, name: true, schedulingUrl: true } },
        },
      },
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()
  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.automationRule.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
