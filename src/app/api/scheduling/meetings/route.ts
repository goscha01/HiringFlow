import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Returns all logged meetings for the workspace (manual + future webhook-sourced).
// Filters out invite/click events — only meeting_* and marked_scheduled rows.
export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const events = await prisma.schedulingEvent.findMany({
    where: {
      session: { workspaceId: ws.workspaceId },
      eventType: { in: ['meeting_scheduled', 'meeting_rescheduled', 'marked_scheduled'] },
    },
    include: {
      session: { select: { id: true, candidateName: true, candidateEmail: true } },
      schedulingConfig: { select: { id: true, name: true } },
    },
    orderBy: { eventAt: 'desc' },
    take: 200,
  })

  // Collapse: keep only the most recent event per session (latest reschedule wins).
  const seen = new Set<string>()
  const collapsed = events.filter(e => {
    if (seen.has(e.sessionId)) return false
    seen.add(e.sessionId)
    return true
  })

  // Check for cancellations — if latest event for session is cancelled, exclude it
  const cancelledSessions = await prisma.schedulingEvent.findMany({
    where: {
      session: { workspaceId: ws.workspaceId },
      eventType: 'meeting_cancelled',
      sessionId: { in: collapsed.map(e => e.sessionId) },
    },
    select: { sessionId: true, eventAt: true },
  })
  const cancelledMap = new Map(cancelledSessions.map(c => [c.sessionId, c.eventAt.getTime()]))

  const active = collapsed.filter(e => {
    const cancelAt = cancelledMap.get(e.sessionId)
    return !cancelAt || cancelAt < e.eventAt.getTime()
  })

  return NextResponse.json(active.map(e => ({
    id: e.id,
    eventType: e.eventType,
    eventAt: e.eventAt,
    metadata: e.metadata,
    session: e.session,
    schedulingConfig: e.schedulingConfig,
  })))
}
