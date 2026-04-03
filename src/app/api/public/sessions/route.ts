import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { flowSlug, candidateName, candidateEmail, candidatePhone, preview, adId, source, campaign } = body

    if (!flowSlug) {
      return NextResponse.json({ error: 'Flow slug is required' }, { status: 400 })
    }

    let flow

    if (preview) {
      // Preview mode: allow unpublished flows for workspace members
      const ws = await getWorkspaceSession()
      if (!ws) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      flow = await prisma.flow.findFirst({
        where: {
          slug: flowSlug,
          workspaceId: ws.workspaceId,
        },
        include: {
          steps: {
            orderBy: { stepOrder: 'asc' },
            take: 1,
          },
        },
      })
    } else {
      flow = await prisma.flow.findFirst({
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
    }

    if (!flow) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
    }

    const startStepId = flow.steps[0]?.id || null

    const session = await prisma.session.create({
      data: {
        flowId: flow.id,
        workspaceId: flow.workspaceId,
        candidateName: candidateName || null,
        candidateEmail: candidateEmail || null,
        candidatePhone: candidatePhone || null,
        lastStepId: startStepId,
        // Source attribution (from Ad link)
        adId: adId || null,
        source: source || null,
        campaign: campaign || null,
      },
    })

    logger.info('Session started', { sessionId: session.id, flowSlug, flowId: flow.id, preview: !!preview })

    return NextResponse.json({
      id: session.id,
      startStepId,
    })
  } catch (error: any) {
    logger.error('Create session failed', { error: error.message })
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
