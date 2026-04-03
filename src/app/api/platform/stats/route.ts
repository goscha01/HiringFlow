import { NextResponse } from 'next/server'
import { getSuperAdminSession, forbidden, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const sa = await getSuperAdminSession()
  if (!sa) return sa === null ? unauthorized() : forbidden()

  const [
    totalUsers,
    totalWorkspaces,
    activeWorkspaces,
    totalSessions,
    totalFlows,
    totalTrainings,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.workspace.count({ where: { isActive: true } }),
    prisma.session.count(),
    prisma.flow.count(),
    prisma.training.count(),
    prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
  ])

  // Plan breakdown
  const planBreakdown = await prisma.workspace.groupBy({
    by: ['plan'],
    _count: true,
  })

  return NextResponse.json({
    totalUsers,
    totalWorkspaces,
    activeWorkspaces,
    totalSessions,
    totalFlows,
    totalTrainings,
    recentUsers,
    planBreakdown: planBreakdown.map(p => ({ plan: p.plan, count: p._count })),
  })
}
