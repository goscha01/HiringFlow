import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
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
    const { optionText, nextStepId } = body

    const option = await prisma.stepOption.create({
      data: {
        stepId: params.stepId,
        optionText: optionText || 'New Option',
        nextStepId: nextStepId || null,
      },
    })

    return NextResponse.json(option)
  } catch (error) {
    console.error('Create option error:', error)
    return NextResponse.json({ error: 'Failed to create option' }, { status: 500 })
  }
}
