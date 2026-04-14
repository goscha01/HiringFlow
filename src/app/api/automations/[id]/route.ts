import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()
  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json()

  // If training is being set, auto-switch it to invitation_only
  if (body.nextStepType === 'training' && body.trainingId) {
    await prisma.training.update({
      where: { id: body.trainingId },
      data: { accessMode: 'invitation_only' },
    })
  }

  const updated = await prisma.automationRule.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.triggerType !== undefined && { triggerType: body.triggerType }),
      ...(body.flowId !== undefined && { flowId: body.flowId || null }),
      ...(body.triggerAutomationId !== undefined && { triggerAutomationId: body.triggerAutomationId || null }),
      ...(body.emailTemplateId !== undefined && { emailTemplateId: body.emailTemplateId }),
      ...(body.nextStepType !== undefined && { nextStepType: body.nextStepType || null }),
      ...(body.nextStepUrl !== undefined && { nextStepUrl: body.nextStepUrl || null }),
      ...(body.trainingId !== undefined && { trainingId: body.trainingId || null }),
      ...(body.schedulingConfigId !== undefined && { schedulingConfigId: body.schedulingConfigId || null }),
      ...(body.delayMinutes !== undefined && { delayMinutes: body.delayMinutes || 0 }),
      ...(body.emailDestination !== undefined && { emailDestination: body.emailDestination || 'applicant' }),
      ...(body.emailDestinationAddress !== undefined && { emailDestinationAddress: body.emailDestinationAddress || null }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
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
