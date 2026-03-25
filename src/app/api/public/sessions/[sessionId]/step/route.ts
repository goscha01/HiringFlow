import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVideoUrl } from '@/lib/storage'

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const session = await prisma.session.findUnique({
    where: { id: params.sessionId },
    include: {
      flow: true,
      lastStep: {
        include: {
          video: true,
          options: {
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Allow access if flow is published OR if this is a preview session (already authenticated at creation)
  // Session creation already validates ownership for unpublished flows

  // Session is finished
  if (session.finishedAt) {
    return NextResponse.json({ finished: true })
  }

  // No current step (shouldn't happen normally)
  if (!session.lastStep) {
    return NextResponse.json({ finished: true })
  }

  const step = session.lastStep

  return NextResponse.json({
    stepId: step.id,
    title: step.title,
    videoUrl: step.video ? getVideoUrl(step.video.storageKey) : null,
    questionText: step.questionText,
    stepType: step.stepType,
    questionType: step.questionType,
    captionsEnabled: step.captionsEnabled,
    captionStyle: step.captionStyle,
    segments: step.captionsEnabled && step.video ? (step.video as any).segments || [] : [],
    options: step.options.map((o) => ({
      optionId: o.id,
      text: o.optionText,
      nextStepId: o.nextStepId,
    })),
  })
}
