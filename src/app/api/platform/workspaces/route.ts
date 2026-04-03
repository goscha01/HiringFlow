import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminSession, forbidden, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const sa = await getSuperAdminSession()
  if (!sa) return sa === null ? unauthorized() : forbidden()

  const workspaces = await prisma.workspace.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { members: true, flows: true, sessions: true, trainings: true, ads: true },
      },
    },
  })

  return NextResponse.json(workspaces.map(w => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    plan: w.plan,
    isActive: w.isActive,
    createdAt: w.createdAt,
    counts: w._count,
  })))
}
