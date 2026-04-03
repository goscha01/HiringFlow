import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
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
    const { title, videoId, questionText, stepType, questionType, formEnabled, formConfig, infoContent, buttonConfig, options } = body

    // Get current max step order
    const maxOrder = await prisma.flowStep.aggregate({
      where: { flowId: params.id },
      _max: { stepOrder: true },
    })

    const step = await prisma.flowStep.create({
      data: {
        flowId: params.id,
        title: title || 'New Step',
        videoId: videoId || null,
        questionText: questionText || null,
        stepType: stepType || 'question',
        questionType: questionType || 'single',
        stepOrder: (maxOrder._max.stepOrder ?? -1) + 1,
        ...(formEnabled !== undefined && { formEnabled }),
        ...(formConfig !== undefined && { formConfig }),
        ...(infoContent !== undefined && { infoContent }),
        ...(buttonConfig !== undefined && { buttonConfig }),
        // Create answer options if provided
        ...(options && Array.isArray(options) && options.length > 0 && {
          options: {
            create: options.map((optText: string) => ({
              optionText: optText,
            })),
          },
        }),
      },
      include: {
        video: true,
        options: true,
      },
    })

    return NextResponse.json(step)
  } catch (error) {
    console.error('Create step error:', error)
    return NextResponse.json({ error: 'Failed to create step' }, { status: 500 })
  }
}
