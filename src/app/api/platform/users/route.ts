import { NextResponse } from 'next/server'
import { getSuperAdminSession, forbidden, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const sa = await getSuperAdminSession()
  if (!sa) return sa === null ? unauthorized() : forbidden()

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      memberships: {
        include: {
          workspace: { select: { id: true, name: true, plan: true, isActive: true } },
        },
      },
    },
  })

  return NextResponse.json(users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    isSuperAdmin: u.isSuperAdmin,
    createdAt: u.createdAt,
    workspaces: u.memberships.map(m => ({
      id: m.workspace.id,
      name: m.workspace.name,
      plan: m.workspace.plan,
      isActive: m.workspace.isActive,
      role: m.role,
    })),
  })))
}
