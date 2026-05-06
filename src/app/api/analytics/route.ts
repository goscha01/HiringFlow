import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { getFunnelMetrics, getSourceMetrics, getAdMetrics, getStatusMetrics, DateFilter } from '@/lib/analytics'

export async function GET(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const range = request.nextUrl.searchParams.get('range') || 'all'

  let filter: DateFilter | undefined
  const now = new Date()

  if (range === '7d') {
    filter = { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
  } else if (range === '30d') {
    filter = { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
  }

  const [funnel, sources, ads, status] = await Promise.all([
    getFunnelMetrics(ws.workspaceId, filter),
    getSourceMetrics(ws.workspaceId, filter),
    getAdMetrics(ws.workspaceId, filter),
    getStatusMetrics(ws.workspaceId, filter),
  ])

  return NextResponse.json({ funnel, sources, ads, status })
}
