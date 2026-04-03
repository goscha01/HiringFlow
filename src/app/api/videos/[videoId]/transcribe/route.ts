import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { transcribeFromUrl } from '@/lib/deepgram'
import { getVideoUrl } from '@/lib/storage'

export const maxDuration = 120

export async function POST(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const video = await prisma.video.findFirst({
    where: { id: params.videoId, workspaceId: ws.workspaceId },
  })

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }

  try {
    const videoUrl = video.storageKey.startsWith('http')
      ? video.storageKey
      : `${request.nextUrl.origin}${getVideoUrl(video.storageKey)}`

    const { transcript, segments } = await transcribeFromUrl(videoUrl)

    // Save transcript to video record
    await prisma.video.update({
      where: { id: video.id },
      data: { transcript, segments: segments as any },
    })

    return NextResponse.json({ text: transcript, segments })
  } catch (error: any) {
    console.error('Transcription error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Transcription failed' },
      { status: 500 }
    )
  }
}
