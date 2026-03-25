import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const body = await request.json()
    const { stepId, optionId, optionIds } = body

    // Support both single optionId and array optionIds
    const selectedOptionIds: string[] = optionIds || (optionId ? [optionId] : [])

    if (!stepId || selectedOptionIds.length === 0) {
      return NextResponse.json(
        { error: 'stepId and at least one option are required' },
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

    if (session.finishedAt) {
      return NextResponse.json({ error: 'Session already finished' }, { status: 400 })
    }

    // Get the step to check its question type
    const step = await prisma.flowStep.findUnique({
      where: { id: stepId },
    })

    if (!step) {
      return NextResponse.json({ error: 'Step not found' }, { status: 404 })
    }

    // Verify all options belong to the step
    const options = await prisma.stepOption.findMany({
      where: {
        id: { in: selectedOptionIds },
        stepId: stepId,
      },
    })

    if (options.length !== selectedOptionIds.length) {
      return NextResponse.json({ error: 'Invalid option(s)' }, { status: 400 })
    }

    // Delete existing answers for this step (to handle re-answers and multiselect)
    await prisma.sessionAnswer.deleteMany({
      where: {
        sessionId: params.sessionId,
        stepId: stepId,
      },
    })

    // Create answer(s)
    await prisma.sessionAnswer.createMany({
      data: selectedOptionIds.map((oid) => ({
        sessionId: params.sessionId,
        stepId: stepId,
        optionId: oid,
      })),
    })

    // Determine next step (use first option's nextStepId)
    const firstOption = options[0]
    const nextStepId = firstOption?.nextStepId

    if (nextStepId) {
      // Update session to next step
      await prisma.session.update({
        where: { id: params.sessionId },
        data: { lastStepId: nextStepId },
      })

      return NextResponse.json({ nextStepId })
    } else {
      // End of flow
      await prisma.session.update({
        where: { id: params.sessionId },
        data: {
          finishedAt: new Date(),
        },
      })

      return NextResponse.json({ finished: true })
    }
  } catch (error) {
    console.error('Submit answer error:', error)
    return NextResponse.json({ error: 'Failed to submit answer' }, { status: 500 })
  }
}
