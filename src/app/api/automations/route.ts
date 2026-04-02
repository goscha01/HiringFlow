import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rules = await prisma.automationRule.findMany({
    where: { ownerUserId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      flow: { select: { id: true, name: true } },
      emailTemplate: { select: { id: true, name: true, subject: true } },
      _count: { select: { executions: true } },
    },
  })
  return NextResponse.json(rules)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, triggerType, flowId, emailTemplateId, nextStepType, nextStepUrl } = await request.json()
  if (!name || !triggerType || !emailTemplateId) return NextResponse.json({ error: 'name, triggerType, emailTemplateId required' }, { status: 400 })
  const rule = await prisma.automationRule.create({
    data: {
      ownerUserId: session.user.id, name, triggerType,
      flowId: flowId || null, emailTemplateId,
      nextStepType: nextStepType || null, nextStepUrl: nextStepUrl || null,
    },
    include: { flow: { select: { id: true, name: true } }, emailTemplate: { select: { id: true, name: true } } },
  })
  return NextResponse.json(rule)
}
