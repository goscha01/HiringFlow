import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const trainings = await prisma.training.findMany({
    where: { ownerUserId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      sections: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { contents: true } } } },
      _count: { select: { enrollments: true } },
    },
  })

  return NextResponse.json(trainings)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, description, timeLimit, pricing } = body

  const training = await prisma.training.create({
    data: {
      ownerUserId: session.user.id,
      title: title || 'Untitled Training',
      slug: nanoid(10),
      description,
      timeLimit: timeLimit || { type: 'unlimited' },
      pricing: pricing || { type: 'free' },
    },
  })

  return NextResponse.json(training)
}
