import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function POST(request: NextRequest) {
  const { email, password, name, businessName } = await request.json()

  if (!email || !password || !businessName) {
    return NextResponse.json({ error: 'email, password, and businessName are required' }, { status: 400 })
  }

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  // Create user + workspace + membership in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
      },
    })

    const workspace = await tx.workspace.create({
      data: {
        name: businessName,
        slug: nanoid(10),
      },
    })

    await tx.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: 'owner',
      },
    })

    return { user, workspace }
  })

  return NextResponse.json({
    success: true,
    userId: result.user.id,
    workspaceId: result.workspace.id,
  })
}
