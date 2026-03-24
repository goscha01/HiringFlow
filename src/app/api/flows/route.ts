import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function GET() {
  const session = await getServerSession(authOptions)
  console.log('[GET /api/flows] session user id:', session?.user?.id)

  if (!session?.user?.id) {
    console.log('[GET /api/flows] NO SESSION - returning 401')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const flows = await prisma.flow.findMany({
    where: { ownerUserId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { steps: true, sessions: true },
      },
    },
  })
  console.log('[GET /api/flows] found', flows.length, 'flows for user', session.user.id)

  return NextResponse.json(flows)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const slug = nanoid(10)

    const flow = await prisma.flow.create({
      data: {
        ownerUserId: session.user.id,
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
