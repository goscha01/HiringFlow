import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVideoUrl } from '@/lib/storage'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const training = await prisma.training.findFirst({
    where: { id: params.id, ownerUserId: session.user.id },
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          contents: { orderBy: { sortOrder: 'asc' }, include: { video: true } },
          quiz: { include: { questions: { orderBy: { sortOrder: 'asc' } } } },
        },
      },
    },
  })

  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Add video URLs
  const withUrls = {
    ...training,
    sections: training.sections.map((section) => ({
      ...section,
      contents: section.contents.map((content) => ({
        ...content,
        video: content.video ? { ...content.video, url: getVideoUrl(content.video.storageKey) } : null,
      })),
    })),
  }

  return NextResponse.json(withUrls)
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const training = await prisma.training.findFirst({ where: { id: params.id, ownerUserId: session.user.id } })
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const { title, description, coverImage, timeLimit, pricing, passingGrade, isPublished, branding } = body

  const updated = await prisma.training.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(coverImage !== undefined && { coverImage }),
      ...(timeLimit !== undefined && { timeLimit }),
      ...(pricing !== undefined && { pricing }),
      ...(passingGrade !== undefined && { passingGrade }),
      ...(isPublished !== undefined && { isPublished }),
      ...(branding !== undefined && { branding }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const training = await prisma.training.findFirst({ where: { id: params.id, ownerUserId: session.user.id } })
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.training.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
