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

  // Count total steps and get all step IDs for progress navigation
  const allSteps = await prisma.flowStep.findMany({
    where: { flowId: session.flowId },
    orderBy: { stepOrder: 'asc' },
    select: { id: true, stepOrder: true, combinedWithId: true },
  })
  const totalSteps = allSteps.length
  const currentStepOrder = step.stepOrder

  // Check if this step has a combined partner
  let combinedStep = null
  const combinedWithId = (step as any).combinedWithId as string | null
  if (combinedWithId) {
    const partner = await prisma.flowStep.findUnique({
      where: { id: combinedWithId },
      include: { video: true, options: { orderBy: { createdAt: 'asc' } } },
    })
    if (partner) {
      combinedStep = {
        stepId: partner.id,
        title: partner.title,
        videoUrl: partner.video ? getVideoUrl(partner.video.storageKey) : null,
        questionText: partner.questionText,
        stepType: partner.stepType,
        questionType: partner.questionType,
        infoContent: (partner as any).infoContent || null,
        captionsEnabled: partner.captionsEnabled,
        segments: partner.captionsEnabled && partner.video ? (partner.video as any).segments || [] : [],
        formEnabled: partner.formEnabled || partner.stepType === 'form',
        formConfig: partner.formConfig,
        options: partner.options.map((o) => ({
          optionId: o.id,
          text: o.optionText,
          nextStepId: o.nextStepId,
        })),
      }
    }
  }

  // Also check if another step combines WITH this step
  if (!combinedStep) {
    const reversePartner = await prisma.flowStep.findFirst({
      where: { combinedWithId: step.id },
      include: { video: true, options: { orderBy: { createdAt: 'asc' } } },
    })
    if (reversePartner) {
      combinedStep = {
        stepId: reversePartner.id,
        title: reversePartner.title,
        videoUrl: reversePartner.video ? getVideoUrl(reversePartner.video.storageKey) : null,
        questionText: reversePartner.questionText,
        stepType: reversePartner.stepType,
        questionType: reversePartner.questionType,
        infoContent: (reversePartner as any).infoContent || null,
        captionsEnabled: reversePartner.captionsEnabled,
        segments: reversePartner.captionsEnabled && reversePartner.video ? (reversePartner.video as any).segments || [] : [],
        formEnabled: reversePartner.formEnabled || reversePartner.stepType === 'form',
        formConfig: reversePartner.formConfig,
        options: reversePartner.options.map((o) => ({
          optionId: o.id,
          text: o.optionText,
          nextStepId: o.nextStepId,
        })),
      }
    }
  }

  return NextResponse.json({
    stepId: step.id,
    title: step.title,
    videoUrl: step.video ? getVideoUrl(step.video.storageKey) : null,
    questionText: step.questionText,
    stepType: step.stepType,
    questionType: step.questionType,
    infoContent: (step as Record<string, unknown>).infoContent || null,
    captionsEnabled: step.captionsEnabled,
    captionStyle: step.captionStyle,
    segments: step.captionsEnabled && step.video ? (step.video as any).segments || [] : [],
    formEnabled: step.formEnabled || step.stepType === 'form',
    formConfig: step.formConfig,
    progress: { current: currentStepOrder + 1, total: totalSteps },
    stepIds: allSteps.map(s => s.id),
    combinedStep,
    options: step.options.map((o) => ({
      optionId: o.id,
      text: o.optionText,
      nextStepId: o.nextStepId,
    })),
  })
}
