import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const source = await prisma.automationRule.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    include: { steps: { orderBy: { order: 'asc' } } },
  })
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const copy = await prisma.automationRule.create({
    data: {
      workspaceId: source.workspaceId,
      createdById: ws.userId,
      name: `${source.name} (copy)`,
      triggerType: source.triggerType,
      flowId: source.flowId,
      triggerAutomationId: source.triggerAutomationId,
      actionType: source.actionType,
      // Legacy per-rule fields are still in sync with step 0 right after the
      // backfill; mirror them on the copy so existing read paths keep working
      // until we drop these columns in a follow-up.
      channel: source.channel,
      emailTemplateId: source.emailTemplateId,
      smsBody: source.smsBody,
      nextStepType: source.nextStepType,
      nextStepUrl: source.nextStepUrl,
      trainingId: source.trainingId,
      schedulingConfigId: source.schedulingConfigId,
      delayMinutes: source.delayMinutes,
      minutesBefore: source.minutesBefore,
      waitForRecording: source.waitForRecording,
      emailDestination: source.emailDestination,
      emailDestinationAddress: source.emailDestinationAddress,
      isActive: false, // start paused — user reviews before enabling
      steps: {
        create: source.steps.map((s) => ({
          order: s.order,
          delayMinutes: s.delayMinutes,
          timingMode: s.timingMode,
          channel: s.channel,
          emailTemplateId: s.emailTemplateId,
          smsBody: s.smsBody,
          emailDestination: s.emailDestination,
          emailDestinationAddress: s.emailDestinationAddress,
          nextStepType: s.nextStepType,
          nextStepUrl: s.nextStepUrl,
          trainingId: s.trainingId,
          schedulingConfigId: s.schedulingConfigId,
        })),
      },
    },
  })

  return NextResponse.json(copy)
}
