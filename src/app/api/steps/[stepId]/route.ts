import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVideoUrl } from '@/lib/storage'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { stepId: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const step = await prisma.flowStep.findFirst({
    where: { id: params.stepId },
    include: {
      flow: true,
    },
  })

  if (!step || step.flow.ownerUserId !== session.user.id) {
    return NextResponse.json({ error: 'Step not found' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const { title, videoId, questionText, stepOrder, stepType, questionType, formEnabled, formConfig } = body

    const updated = await prisma.flowStep.update({
      where: { id: params.stepId },
      data: {
        ...(title !== undefined && { title }),
        ...(videoId !== undefined && { videoId: videoId || null }),
        ...(questionText !== undefined && { questionText: questionText || null }),
        ...(stepOrder !== undefined && { stepOrder }),
        ...(stepType !== undefined && { stepType }),
        ...(questionType !== undefined && { questionType }),
        ...(formEnabled !== undefined && { formEnabled }),
        ...(formConfig !== undefined && { formConfig }),
      },
      include: {
        video: true,
        options: true,
      },
    })

    return NextResponse.json({
      ...updated,
      video: updated.video
        ? {
            ...updated.video,
            url: getVideoUrl(updated.video.storageKey),
          }
        : null,
    })
  } catch (error) {
    console.error('Update step error:', error)
    return NextResponse.json({ error: 'Failed to update step' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { stepId: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const step = await prisma.flowStep.findFirst({
    where: { id: params.stepId },
    include: {
      flow: true,
    },
  })

  if (!step || step.flow.ownerUserId !== session.user.id) {
    return NextResponse.json({ error: 'Step not found' }, { status: 404 })
  }

  await prisma.flowStep.delete({
    where: { id: params.stepId },
  })

  return NextResponse.json({ success: true })
}
