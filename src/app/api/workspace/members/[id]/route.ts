import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const member = await prisma.workspaceMember.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
  })
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { role } = await request.json()
  const updated = await prisma.workspaceMember.update({
    where: { id: params.id },
    data: { role },
  })
  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const member = await prisma.workspaceMember.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
  })
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (member.userId === ws.userId) return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })

  await prisma.workspaceMember.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
