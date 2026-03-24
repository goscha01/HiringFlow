import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { saveCandidateVideoFile } from '@/lib/storage'

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const formData = await request.formData()
    const stepId = formData.get('stepId') as string
    const textMessage = formData.get('textMessage') as string | null
    const video = formData.get('video') as File | null

    if (!stepId) {
      return NextResponse.json(
        { error: 'stepId is required' },
        { status: 400 }
      )
    }

    if (!textMessage && !video) {
      return NextResponse.json(
        { error: 'Either textMessage or video is required' },
        { status: 400 }
      )
    }

    const session = await prisma.session.findUnique({
      where: { id: params.sessionId },
      include: {
        flow: true,
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (!session.flow.isPublished) {
      return NextResponse.json({ error: 'Flow not available' }, { status: 404 })
    }

    if (session.finishedAt) {
      return NextResponse.json({ error: 'Session already finished' }, { status: 400 })
    }

    // Verify the step exists and is a submission type
    const step = await prisma.flowStep.findUnique({
      where: { id: stepId },
    })

    if (!step) {
      return NextResponse.json({ error: 'Step not found' }, { status: 404 })
    }

    if (step.stepType !== 'submission') {
      return NextResponse.json(
        { error: 'This step does not accept submissions' },
        { status: 400 }
      )
    }

    // Prepare submission data
    let videoData: {
      videoStorageKey: string
      videoFilename: string
      videoMimeType: string
      videoSizeBytes: number
    } | null = null

    if (video && video.size > 0) {
      const saved = await saveCandidateVideoFile(video)
      videoData = {
        videoStorageKey: saved.storageKey,
        videoFilename: saved.filename,
        videoMimeType: saved.mimeType,
        videoSizeBytes: saved.sizeBytes,
      }
    }

    // Upsert the submission (allows re-submission)
    await prisma.candidateSubmission.upsert({
      where: {
        sessionId_stepId: {
          sessionId: params.sessionId,
          stepId: stepId,
        },
      },
      create: {
        sessionId: params.sessionId,
        stepId: stepId,
        textMessage: textMessage || null,
        ...(videoData || {}),
      },
      update: {
        textMessage: textMessage || null,
        ...(videoData || {}),
      },
    })

    // Mark session as finished (submission step ends the flow)
    await prisma.session.update({
      where: { id: params.sessionId },
      data: {
        lastStepId: stepId,
        finishedAt: new Date(),
      },
    })

    return NextResponse.json({ finished: true })
  } catch (error) {
    console.error('Submit submission error:', error)
    return NextResponse.json(
      { error: 'Failed to submit response' },
      { status: 500 }
    )
  }
}
