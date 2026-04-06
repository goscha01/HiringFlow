import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const configs = await prisma.aICallConfig.findMany({
    where: { workspaceId: ws.workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { calls: true } },
      calls: {
        where: { status: 'completed' },
        select: { id: true },
      },
    },
  })

  return NextResponse.json(configs.map(c => ({
    ...c,
    completedCalls: c.calls.length,
    calls: undefined,
  })))
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { name, agentId, requiredCalls } = await request.json()
  if (!name || !agentId) return NextResponse.json({ error: 'name and agentId required' }, { status: 400 })

  const config = await prisma.aICallConfig.create({
    data: {
      workspaceId: ws.workspaceId,
      createdById: ws.userId,
      name,
      slug: nanoid(10),
      agentId,
      requiredCalls: requiredCalls || 1,
    },
  })

  return NextResponse.json(config)
}
