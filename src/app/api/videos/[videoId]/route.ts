import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const video = await prisma.video.findFirst({
    where: { id: params.videoId, ownerUserId: session.user.id },
  })

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }

  // Unlink from any steps first
  await prisma.flowStep.updateMany({
    where: { videoId: video.id },
    data: { videoId: null },
  })

  await prisma.video.delete({ where: { id: video.id } })

  // Delete from blob storage if it's a blob URL
  if (video.storageKey.startsWith('http')) {
    try {
      const { del } = await import('@vercel/blob')
      await del(video.storageKey)
    } catch {}
  }

  return NextResponse.json({ success: true })
}
