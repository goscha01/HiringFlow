import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVideoUrl } from '@/lib/storage'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const flow = await prisma.flow.findFirst({
    where: {
      id: params.id,
      workspaceId: ws.workspaceId,
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
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const flow = await prisma.flow.findFirst({
    where: {
      id: params.id,
      workspaceId: ws.workspaceId,
    },
  })

  if (!flow) {
    return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const { name, isPublished, startMessage, endMessage, branding } = body

    const updated = await prisma.flow.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(isPublished !== undefined && { isPublished }),
        ...(startMessage !== undefined && { startMessage }),
        ...(endMessage !== undefined && { endMessage }),
        ...(branding !== undefined && { branding }),
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
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const flow = await prisma.flow.findFirst({
    where: {
      id: params.id,
      workspaceId: ws.workspaceId,
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
