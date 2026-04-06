import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const config = await prisma.aICallConfig.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    include: {
      calls: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(config)
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const config = await prisma.aICallConfig.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const updated = await prisma.aICallConfig.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.agentId !== undefined && { agentId: body.agentId }),
      ...(body.requiredCalls !== undefined && { requiredCalls: body.requiredCalls }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const config = await prisma.aICallConfig.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.aICallConfig.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
