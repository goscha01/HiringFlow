import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminSession, forbidden, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const sa = await getSuperAdminSession()
  if (!sa) return sa === null ? unauthorized() : forbidden()

  const body = await request.json()
  const workspace = await prisma.workspace.findUnique({ where: { id: params.id } })
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.workspace.update({
    where: { id: params.id },
    data: {
      ...(body.plan !== undefined && { plan: body.plan }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.name !== undefined && { name: body.name }),
    },
  })

  return NextResponse.json(updated)
}
