import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  })

  if (!flow) {
    return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
  }

  const sessions = await prisma.session.findMany({
    where: { flowId: params.id },
    orderBy: { startedAt: 'desc' },
    include: {
      answers: {
        include: {
          step: true,
          option: true,
        },
        orderBy: { answeredAt: 'asc' },
      },
      submissions: {
        include: {
          step: true,
        },
        orderBy: { submittedAt: 'asc' },
      },
    },
  })

  return NextResponse.json(sessions)
}
