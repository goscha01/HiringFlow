import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const config = await prisma.schedulingConfig.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()

  // If setting as default, clear existing defaults
  if (body.isDefault === true) {
    await prisma.schedulingConfig.updateMany({
      where: { workspaceId: ws.workspaceId, isDefault: true, id: { not: params.id } },
      data: { isDefault: false },
    })
  }

  const updated = await prisma.schedulingConfig.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.schedulingUrl !== undefined && { schedulingUrl: body.schedulingUrl }),
      ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const config = await prisma.schedulingConfig.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.schedulingConfig.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
