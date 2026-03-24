import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Register a blob-uploaded video in the database
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url, filename, mimeType, sizeBytes } = await request.json()

  if (!url) {
    return NextResponse.json({ error: 'Missing blob URL' }, { status: 400 })
  }

  const video = await prisma.video.create({
    data: {
      ownerUserId: session.user.id,
      filename: filename || 'video',
      storageKey: url,
      mimeType: mimeType || 'video/mp4',
      sizeBytes: sizeBytes || 0,
    },
  })

  return NextResponse.json({
    ...video,
    url: video.storageKey,
  })
}
