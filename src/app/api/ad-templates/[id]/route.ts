import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const template = await prisma.adTemplate.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const updated = await prisma.adTemplate.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.source !== undefined && { source: body.source }),
      ...(body.headline !== undefined && { headline: body.headline }),
      ...(body.bodyText !== undefined && { bodyText: body.bodyText }),
      ...(body.requirements !== undefined && { requirements: body.requirements || null }),
      ...(body.benefits !== undefined && { benefits: body.benefits || null }),
      ...(body.callToAction !== undefined && { callToAction: body.callToAction || null }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const template = await prisma.adTemplate.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.adTemplate.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
