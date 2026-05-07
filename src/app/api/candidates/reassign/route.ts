import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordPipelineStatusChange } from '@/lib/pipeline-status'

// Bulk-reassign all sessions whose pipelineStatus matches `fromStatus` (within
// the caller's workspace) to `toStatus`. Used by the funnel stage settings UI
// when deleting a stage that still has candidates in it.
export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { fromStatus, toStatus } = await request.json()
  if (typeof toStatus !== 'string' || !toStatus) {
    return NextResponse.json({ error: 'toStatus is required' }, { status: 400 })
  }

  // Snapshot the affected ids so we can audit each move after the bulk
  // update. Required because updateMany doesn't return affected rows.
  const affected = await prisma.session.findMany({
    where: {
      workspaceId: ws.workspaceId,
      pipelineStatus: typeof fromStatus === 'string' ? fromStatus : null,
    },
    select: { id: true, pipelineStatus: true },
  })

  const result = await prisma.session.updateMany({
    where: {
      workspaceId: ws.workspaceId,
      pipelineStatus: typeof fromStatus === 'string' ? fromStatus : null,
    },
    data: { pipelineStatus: toStatus },
  })

  await Promise.all(
    affected.map((s) =>
      recordPipelineStatusChange({
        sessionId: s.id,
        fromStatus: s.pipelineStatus,
        toStatus,
        source: 'manual:reassign',
        triggeredBy: ws.userId,
      }),
    ),
  )

  return NextResponse.json({ updated: result.count })
}
