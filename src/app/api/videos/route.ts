import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { saveVideoFile, getVideoUrl } from '@/lib/storage'

export async function GET() {
  const session = await getServerSession(authOptions)
  console.log('[GET /api/videos] session user id:', session?.user?.id)

  if (!session?.user?.id) {
    console.log('[GET /api/videos] NO SESSION - returning 401')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const videos = await prisma.video.findMany({
    where: { ownerUserId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })
  console.log('[GET /api/videos] found', videos.length, 'videos for user', session.user.id)

  const videosWithUrls = videos.map((video) => ({
    ...video,
    url: getVideoUrl(video.storageKey),
  }))

  return NextResponse.json(videosWithUrls)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()

    // Support both single 'video' and multiple 'videos' fields
    const singleFile = formData.get('video') as File | null
    const multipleFiles = formData.getAll('videos') as File[]

    const files = singleFile ? [singleFile] : multipleFiles

    if (files.length === 0) {
      return NextResponse.json({ error: 'No video files provided' }, { status: 400 })
    }

    const uploaded = []
    const errors = []

    for (const file of files) {
      if (!file.type.startsWith('video/')) {
        errors.push({ filename: file.name, error: 'Not a video file' })
        continue
      }

      try {
        const { storageKey, filename, mimeType, sizeBytes } = await saveVideoFile(file)

        const video = await prisma.video.create({
          data: {
            ownerUserId: session.user.id,
            filename,
            storageKey,
            mimeType,
            sizeBytes,
          },
        })

        uploaded.push({
          ...video,
          url: getVideoUrl(video.storageKey),
        })
      } catch (err) {
        errors.push({ filename: file.name, error: 'Upload failed' })
      }
    }

    // For backward compatibility: if single file was uploaded, return single object
    if (singleFile && uploaded.length === 1) {
      return NextResponse.json(uploaded[0])
    }

    // For multiple files, return detailed response
    return NextResponse.json({
      uploaded,
      errors,
      total: files.length,
      successful: uploaded.length,
    })
  } catch (error) {
    console.error('Video upload error:', error)
    return NextResponse.json({ error: 'Failed to upload video' }, { status: 500 })
  }
}
