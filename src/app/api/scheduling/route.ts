import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const configs = await prisma.schedulingConfig.findMany({
    where: { workspaceId: ws.workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { events: true } },
    },
  })

  return NextResponse.json(configs)
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { name, schedulingUrl, isDefault } = await request.json()
  if (!name || !schedulingUrl) return NextResponse.json({ error: 'name and schedulingUrl required' }, { status: 400 })

  // If setting as default, clear existing defaults
  if (isDefault) {
    await prisma.schedulingConfig.updateMany({
      where: { workspaceId: ws.workspaceId, isDefault: true },
      data: { isDefault: false },
    })
  }

  const config = await prisma.schedulingConfig.create({
    data: {
      workspaceId: ws.workspaceId,
      createdById: ws.userId,
      name,
      provider: 'calendly',
      schedulingUrl,
      isDefault: !!isDefault,
    },
  })

  return NextResponse.json(config)
}
