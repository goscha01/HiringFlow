import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const training = await prisma.training.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const enrollments = await prisma.trainingEnrollment.findMany({
    where: { trainingId: params.id },
    orderBy: { startedAt: 'desc' },
    include: {
      accessToken: {
        select: { token: true, status: true, createdAt: true, sourceRefId: true },
      },
      session: {
        select: { id: true, candidateName: true, candidateEmail: true, source: true, flow: { select: { name: true } } },
      },
    },
  })

  return NextResponse.json(enrollments)
}
