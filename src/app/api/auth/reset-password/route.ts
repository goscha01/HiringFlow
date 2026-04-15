import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const { token, password } = await request.json().catch(() => ({}))
  if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Token and password required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  })

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ])

  return NextResponse.json({ success: true })
}

// GET validates the token without consuming it — used by the reset page
// to show a friendly error before the user types a new password.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ valid: false, reason: 'missing' })
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
  if (!record) return NextResponse.json({ valid: false, reason: 'invalid' })
  if (record.usedAt) return NextResponse.json({ valid: false, reason: 'used' })
  if (record.expiresAt < new Date()) return NextResponse.json({ valid: false, reason: 'expired' })
  return NextResponse.json({ valid: true })
}
