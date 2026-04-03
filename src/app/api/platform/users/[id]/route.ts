import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminSession, forbidden, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const sa = await getSuperAdminSession()
  if (!sa) return sa === null ? unauthorized() : forbidden()

  const body = await request.json()
  const user = await prisma.user.findUnique({ where: { id: params.id } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(body.isSuperAdmin !== undefined && { isSuperAdmin: body.isSuperAdmin }),
      ...(body.name !== undefined && { name: body.name }),
    },
  })

  return NextResponse.json({ id: updated.id, email: updated.email, name: updated.name, isSuperAdmin: updated.isSuperAdmin })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const sa = await getSuperAdminSession()
  if (!sa) return sa === null ? unauthorized() : forbidden()

  // Prevent self-delete
  if (params.id === sa.userId) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  await prisma.user.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
