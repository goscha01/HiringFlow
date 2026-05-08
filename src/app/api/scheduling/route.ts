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

  const { name, schedulingUrl, isDefault, useBuiltInScheduler } = await request.json()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  // Built-in scheduler doesn't need an external URL; placeholder is fine.
  if (!useBuiltInScheduler && !schedulingUrl) {
    return NextResponse.json({ error: 'schedulingUrl required for external providers' }, { status: 400 })
  }

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
      provider: useBuiltInScheduler ? 'built_in' : 'calendly',
      schedulingUrl: schedulingUrl || '',
      isDefault: !!isDefault,
      useBuiltInScheduler: !!useBuiltInScheduler,
    },
  })

  return NextResponse.json(config)
}
