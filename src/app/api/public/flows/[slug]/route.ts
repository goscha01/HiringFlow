import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const isPreview = request.nextUrl.searchParams.get('preview') === 'true'

  let flow

  if (isPreview) {
    // Preview mode: workspace member can view unpublished flows
    const ws = await getWorkspaceSession()
    if (!ws) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    flow = await prisma.flow.findFirst({
      where: {
        slug: params.slug,
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
  }

  if (!flow) {
    return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: flow.id,
    name: flow.name,
    slug: flow.slug,
    startMessage: flow.startMessage,
    endMessage: flow.endMessage,
    branding: flow.branding,
    startStepId: flow.steps[0]?.id || null,
  })
}
