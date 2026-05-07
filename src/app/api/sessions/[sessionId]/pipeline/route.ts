import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSchedulingEvent } from '@/lib/scheduling'
import { setPipelineStatus } from '@/lib/pipeline-status'

export async function PATCH(request: NextRequest, { params }: { params: { sessionId: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { pipelineStatus } = await request.json()

  const session = await prisma.session.findUnique({
    where: { id: params.sessionId },
    include: { flow: true },
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Verify workspace ownership
  if (session.flow.workspaceId !== ws.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  await setPipelineStatus({
    sessionId: params.sessionId,
    toStatus: pipelineStatus,
    source: 'manual:pipeline_route',
    triggeredBy: ws.userId,
  })

  // Log scheduling event if marking as scheduled
  if (pipelineStatus === 'scheduled') {
    await logSchedulingEvent({
      sessionId: params.sessionId,
      eventType: 'marked_scheduled',
      metadata: { markedBy: ws.userId },
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, pipelineStatus })
}
