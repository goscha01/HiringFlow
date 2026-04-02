import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, ownerUserId: session.user.id } })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json()
  const updated = await prisma.automationRule.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.triggerType !== undefined && { triggerType: body.triggerType }),
      ...(body.flowId !== undefined && { flowId: body.flowId || null }),
      ...(body.emailTemplateId !== undefined && { emailTemplateId: body.emailTemplateId }),
      ...(body.nextStepType !== undefined && { nextStepType: body.nextStepType || null }),
      ...(body.nextStepUrl !== undefined && { nextStepUrl: body.nextStepUrl || null }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, ownerUserId: session.user.id } })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.automationRule.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
