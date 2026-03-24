import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const flow = await prisma.flow.findFirst({
    where: {
      slug: params.slug,
      isPublished: true,
    },
    include: {
      steps: {
        orderBy: { stepOrder: 'asc' },
        take: 1,
      },
    },
  })

  if (!flow) {
    return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: flow.id,
    name: flow.name,
    slug: flow.slug,
    startMessage: flow.startMessage,
    endMessage: flow.endMessage,
    startStepId: flow.steps[0]?.id || null,
  })
}
