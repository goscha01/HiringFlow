import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const trainings = await prisma.training.findMany({
    where: { workspaceId: ws.workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      sections: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { contents: true } } } },
      _count: { select: { enrollments: true } },
    },
  })

  return NextResponse.json(trainings)
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const body = await request.json()
  const { title, description, timeLimit, pricing, coverImage } = body

  const training = await prisma.training.create({
    data: {
      workspaceId: ws.workspaceId,
      createdById: ws.userId,
      title: title || 'Untitled Training',
      slug: nanoid(10),
      description,
      coverImage: coverImage || null,
      timeLimit: timeLimit || { type: 'unlimited' },
      pricing: pricing || { type: 'free' },
    },
  })

  return NextResponse.json(training)
}
