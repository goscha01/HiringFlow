import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ads = await prisma.ad.findMany({
    where: { ownerUserId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      flow: { select: { id: true, name: true, slug: true } },
      _count: { select: { sessions: true } },
    },
  })

  return NextResponse.json(ads)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, source, campaign, flowId } = body

  if (!name || !source || !flowId) {
    return NextResponse.json({ error: 'name, source, and flowId are required' }, { status: 400 })
  }

  // Verify flow belongs to user
  const flow = await prisma.flow.findFirst({ where: { id: flowId, ownerUserId: session.user.id } })
  if (!flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 })

  const ad = await prisma.ad.create({
    data: {
      ownerUserId: session.user.id,
      name,
      source,
      campaign: campaign || null,
      flowId,
      slug: nanoid(10),
    },
    include: { flow: { select: { id: true, name: true, slug: true } } },
  })

  return NextResponse.json(ad)
}
