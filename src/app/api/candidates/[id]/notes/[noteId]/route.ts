import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Only the author can edit or delete their own note. Workspace owners/admins
// can also delete (cleanup) but not silently rewrite someone else's words.
async function loadNote(noteId: string, candidateId: string, workspaceId: string) {
  return prisma.candidateNote.findFirst({
    where: { id: noteId, sessionId: candidateId, workspaceId },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const note = await loadNote(params.noteId, params.id, ws.workspaceId)
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (note.authorId && note.authorId !== ws.userId) {
    return NextResponse.json({ error: 'Only the author can edit this note' }, { status: 403 })
  }

  const { body } = await request.json().catch(() => ({})) as { body?: string }
  const trimmed = typeof body === 'string' ? body.trim() : ''
  if (!trimmed) {
    return NextResponse.json({ error: 'Note body is required' }, { status: 400 })
  }

  const updated = await prisma.candidateNote.update({
    where: { id: note.id },
    data: { body: trimmed },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const note = await loadNote(params.noteId, params.id, ws.workspaceId)
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAuthor = note.authorId && note.authorId === ws.userId
  const canModerate = ws.role === 'owner' || ws.role === 'admin' || ws.isSuperAdmin
  if (!isAuthor && !canModerate) {
    return NextResponse.json({ error: 'Only the author or an admin can delete this note' }, { status: 403 })
  }

  await prisma.candidateNote.delete({ where: { id: note.id } })

  return NextResponse.json({ success: true })
}
