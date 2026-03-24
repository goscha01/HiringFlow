import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { flowSlug, candidateName, candidateEmail } = body

    if (!flowSlug) {
      return NextResponse.json({ error: 'Flow slug is required' }, { status: 400 })
    }

    const flow = await prisma.flow.findFirst({
      where: {
        slug: flowSlug,
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

    const startStepId = flow.steps[0]?.id || null

    const session = await prisma.session.create({
      data: {
        flowId: flow.id,
        candidateName: candidateName || null,
        candidateEmail: candidateEmail || null,
        lastStepId: startStepId,
      },
    })

    logger.info('Session started', { sessionId: session.id, flowSlug, flowId: flow.id })

    return NextResponse.json({
      id: session.id,
      startStepId,
    })
  } catch (error: any) {
    logger.error('Create session failed', { error: error.message })
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
