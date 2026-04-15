import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const source = await prisma.automationRule.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
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
      emailTemplateId: source.emailTemplateId,
      nextStepType: source.nextStepType,
      nextStepUrl: source.nextStepUrl,
      trainingId: source.trainingId,
      schedulingConfigId: source.schedulingConfigId,
      delayMinutes: source.delayMinutes,
      emailDestination: source.emailDestination,
      emailDestinationAddress: source.emailDestinationAddress,
      isActive: false, // start paused — user reviews before enabling
    },
  })

  return NextResponse.json(copy)
}
