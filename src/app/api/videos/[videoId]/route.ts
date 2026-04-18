import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
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

  return NextResponse.json(video)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const video = await prisma.video.findFirst({
    where: { id: params.videoId, workspaceId: ws.workspaceId },
  })
  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

  const body = await request.json()
  const kind = body.kind === 'interview' || body.kind === 'training' ? body.kind : undefined
  const displayName = typeof body.displayName === 'string' ? body.displayName : undefined

  const updated = await prisma.video.update({
    where: { id: video.id },
    data: {
      ...(kind !== undefined && { kind }),
      ...(displayName !== undefined && { displayName }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
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
