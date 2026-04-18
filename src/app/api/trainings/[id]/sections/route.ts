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
  const kind = body.kind === 'quiz' ? 'quiz' : 'video'
  const defaultTitle = kind === 'quiz' ? 'New Quiz' : 'New Section'

  const section = await prisma.trainingSection.create({
    data: {
      trainingId: params.id,
      title: body.title || defaultTitle,
      kind,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      // Quiz sections get an empty quiz created up-front so the editor has something to attach questions to.
      ...(kind === 'quiz' && {
        quiz: {
          create: {
            title: body.title || 'Quiz',
            requiredPassing: true,
            passingGrade: 80,
          },
        },
      }),
    },
    include: { contents: true, quiz: { include: { questions: true } } },
  })

  return NextResponse.json(section)
}
