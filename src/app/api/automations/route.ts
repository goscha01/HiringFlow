import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()
  const rules = await prisma.automationRule.findMany({
    where: { workspaceId: ws.workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      flow: { select: { id: true, name: true } },
      emailTemplate: { select: { id: true, name: true, subject: true } },
      training: { select: { id: true, title: true, slug: true } },
      schedulingConfig: { select: { id: true, name: true, schedulingUrl: true } },
      _count: { select: { executions: true } },
    },
  })
  return NextResponse.json(rules)
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()
  const { name, triggerType, flowId, emailTemplateId, nextStepType, nextStepUrl, trainingId, schedulingConfigId, delayMinutes } = await request.json()
  if (!name || !triggerType || !emailTemplateId) return NextResponse.json({ error: 'name, triggerType, emailTemplateId required' }, { status: 400 })

  // If training is selected, set the training to invitation_only
  if (nextStepType === 'training' && trainingId) {
    const training = await prisma.training.findFirst({
      where: { id: trainingId, workspaceId: ws.workspaceId },
    })
    if (training) {
      await prisma.training.update({
        where: { id: trainingId },
        data: { accessMode: 'invitation_only' },
      })
    }
  }

  const rule = await prisma.automationRule.create({
    data: {
      workspaceId: ws.workspaceId, createdById: ws.userId, name, triggerType,
      flowId: flowId || null, emailTemplateId,
      nextStepType: nextStepType || null,
      nextStepUrl: nextStepUrl || null,
      trainingId: trainingId || null,
      schedulingConfigId: schedulingConfigId || null,
      delayMinutes: delayMinutes || 0,
    },
    include: {
      flow: { select: { id: true, name: true } },
      emailTemplate: { select: { id: true, name: true } },
      training: { select: { id: true, title: true, slug: true } },
      schedulingConfig: { select: { id: true, name: true, schedulingUrl: true } },
    },
  })
  return NextResponse.json(rule)
}
