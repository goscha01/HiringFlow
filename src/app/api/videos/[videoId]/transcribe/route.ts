import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { openai } from '@/lib/openai'
import { readFile } from 'fs/promises'
import path from 'path'
import { toFile } from 'openai'

// Allow up to 60 seconds for video download + Whisper processing
export const maxDuration = 60

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

export async function POST(
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

  try {
    let buffer: Buffer

    if (video.storageKey.startsWith('http')) {
      // Production: fetch from Vercel Blob URL
      const res = await fetch(video.storageKey)
      if (!res.ok) throw new Error('Failed to fetch video from storage')
      buffer = Buffer.from(await res.arrayBuffer())
    } else {
      // Development: read from local filesystem
      const filePath = path.join(UPLOAD_DIR, video.storageKey)
      buffer = await readFile(filePath)
    }

    const file = await toFile(buffer, video.filename, {
      type: video.mimeType,
    })

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    const segments = (transcription as any).segments?.map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    })) || []

    return NextResponse.json({
      text: transcription.text,
      segments,
    })
  } catch (error: any) {
    console.error('Transcription error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Transcription failed' },
      { status: 500 }
    )
  }
}
