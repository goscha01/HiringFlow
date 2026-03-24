import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVideoUrl } from '@/lib/storage'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  console.log('[GET /api/flows/:id] session:', session?.user?.id, 'flowId:', params.id)

  if (!session?.user?.id) {
    console.log('[GET /api/flows/:id] NO SESSION - returning 401')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const flow = await prisma.flow.findFirst({
    where: {
      id: params.id,
      ownerUserId: session.user.id,
    },
    include: {
      steps: {
        orderBy: { stepOrder: 'asc' },
        include: {
          video: true,
          options: {
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  })

  console.log('[GET /api/flows/:id] flow found:', !!flow, 'steps:', flow?.steps?.length)
  if (!flow) {
    return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
  }

  // Add video URLs
  const flowWithUrls = {
    ...flow,
    steps: flow.steps.map((step) => ({
      ...step,
      video: step.video
        ? {
            ...step.video,
            url: getVideoUrl(step.video.storageKey),
          }
        : null,
    })),
  }

  return NextResponse.json(flowWithUrls)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const flow = await prisma.flow.findFirst({
    where: {
      id: params.id,
      ownerUserId: session.user.id,
    },
  })

  if (!flow) {
    return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const { name, isPublished, startMessage, endMessage } = body

    const updated = await prisma.flow.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(isPublished !== undefined && { isPublished }),
        ...(startMessage !== undefined && { startMessage }),
        ...(endMessage !== undefined && { endMessage }),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update flow error:', error)
    return NextResponse.json({ error: 'Failed to update flow' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const flow = await prisma.flow.findFirst({
    where: {
      id: params.id,
      ownerUserId: session.user.id,
    },
  })

  if (!flow) {
    return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
  }

  await prisma.flow.delete({
    where: { id: params.id },
  })

  return NextResponse.json({ success: true })
}
