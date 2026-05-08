import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const ad = await prisma.ad.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    include: { flow: { select: { id: true, name: true, slug: true, isPublished: true } } },
  })
  if (!ad) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(ad)
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const ad = await prisma.ad.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!ad) return NextResponse.json({ error: 'Ad not found' }, { status: 404 })

  const body = await request.json()
  const { name, source, campaign, flowId, isActive, imageUrl } = body

  const updated = await prisma.ad.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(source !== undefined && { source }),
      ...(campaign !== undefined && { campaign: campaign || null }),
      ...(flowId !== undefined && { flowId }),
      ...(isActive !== undefined && { isActive }),
      ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
    },
    include: { flow: { select: { id: true, name: true, slug: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const ad = await prisma.ad.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!ad) return NextResponse.json({ error: 'Ad not found' }, { status: 404 })

  await prisma.ad.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
