import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  const result = await prisma.session.updateMany({
    where: {
      workspaceId: ws.workspaceId,
      pipelineStatus: typeof fromStatus === 'string' ? fromStatus : null,
    },
    data: { pipelineStatus: toStatus },
  })

  return NextResponse.json({ updated: result.count })
}
