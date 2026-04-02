import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ad = await prisma.ad.findFirst({ where: { id: params.id, ownerUserId: session.user.id } })
  if (!ad) return NextResponse.json({ error: 'Ad not found' }, { status: 404 })

  const body = await request.json()
  const { name, source, campaign, flowId, isActive } = body

  const updated = await prisma.ad.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(source !== undefined && { source }),
      ...(campaign !== undefined && { campaign: campaign || null }),
      ...(flowId !== undefined && { flowId }),
      ...(isActive !== undefined && { isActive }),
    },
    include: { flow: { select: { id: true, name: true, slug: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ad = await prisma.ad.findFirst({ where: { id: params.id, ownerUserId: session.user.id } })
  if (!ad) return NextResponse.json({ error: 'Ad not found' }, { status: 404 })

  await prisma.ad.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
