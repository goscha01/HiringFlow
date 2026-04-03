import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const training = await prisma.training.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const maxOrder = await prisma.trainingSection.aggregate({ where: { trainingId: params.id }, _max: { sortOrder: true } })

  const section = await prisma.trainingSection.create({
    data: {
      trainingId: params.id,
      title: body.title || 'New Section',
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
    include: { contents: true, quiz: true },
  })

  return NextResponse.json(section)
}
