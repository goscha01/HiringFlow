import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const flows = await prisma.flow.findMany({
    where: { workspaceId: ws.workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { steps: true, sessions: true },
      },
    },
  })

  return NextResponse.json(flows)
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const slug = nanoid(10)

    const flow = await prisma.flow.create({
      data: {
        workspaceId: ws.workspaceId,
        createdById: ws.userId,
        name,
        slug,
      },
    })

    return NextResponse.json(flow)
  } catch (error) {
    console.error('Create flow error:', error)
    return NextResponse.json({ error: 'Failed to create flow' }, { status: 500 })
  }
}
