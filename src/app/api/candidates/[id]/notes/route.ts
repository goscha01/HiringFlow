import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function ensureCandidate(id: string, workspaceId: string) {
  return prisma.session.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  })
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const candidate = await ensureCandidate(params.id, ws.workspaceId)
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const notes = await prisma.candidateNote.findMany({
    where: { sessionId: params.id, workspaceId: ws.workspaceId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(notes)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const candidate = await ensureCandidate(params.id, ws.workspaceId)
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { body } = await request.json().catch(() => ({})) as { body?: string }
  const trimmed = typeof body === 'string' ? body.trim() : ''
  if (!trimmed) {
    return NextResponse.json({ error: 'Note body is required' }, { status: 400 })
  }

  const author = await prisma.user.findUnique({
    where: { id: ws.userId },
    select: { name: true, email: true },
  })

  const note = await prisma.candidateNote.create({
    data: {
      sessionId: params.id,
      workspaceId: ws.workspaceId,
      authorId: ws.userId,
      authorName: author?.name || author?.email || null,
      body: trimmed,
    },
  })

  return NextResponse.json(note, { status: 201 })
}
