import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { pictureId: string } }
) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const picture = await prisma.picture.findFirst({
    where: { id: params.pictureId, workspaceId: ws.workspaceId },
  })
  if (!picture) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const displayName = typeof body.displayName === 'string' ? body.displayName : undefined

  const updated = await prisma.picture.update({
    where: { id: picture.id },
    data: { ...(displayName !== undefined && { displayName }) },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { pictureId: string } }
) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const picture = await prisma.picture.findFirst({
    where: { id: params.pictureId, workspaceId: ws.workspaceId },
  })
  if (!picture) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.picture.delete({ where: { id: picture.id } })

  if (picture.storageKey.startsWith('http')) {
    try {
      const { del } = await import('@vercel/blob')
      await del(picture.storageKey)
    } catch {}
  }

  return NextResponse.json({ success: true })
}
