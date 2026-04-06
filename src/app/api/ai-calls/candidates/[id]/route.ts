import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH — add a conversation ID to a candidate
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const candidate = await prisma.aICallCandidate.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { conversationId } = await request.json()

  if (conversationId && !candidate.conversationIds.includes(conversationId)) {
    await prisma.aICallCandidate.update({
      where: { id: params.id },
      data: { conversationIds: [...candidate.conversationIds, conversationId] },
    })
  }

  return NextResponse.json({ success: true })
}

// DELETE
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  await prisma.aICallCandidate.deleteMany({ where: { id: params.id, workspaceId: ws.workspaceId } })
  return NextResponse.json({ success: true })
}
