import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.hirefunnel.app'

export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({ email: null }))
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  // Always respond 200 to avoid leaking which emails are registered.
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!user) {
    return NextResponse.json({ success: true })
  }

  // Generate token: send raw token in URL, store only the sha256 hash.
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  // Invalidate any previous unused tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  })

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  })

  const resetUrl = `${APP_URL}/reset-password?token=${rawToken}`

  await sendEmail({
    to: user.email,
    subject: 'Reset your HireFunnel password',
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color: #262626;">Reset your password</h2>
        <p style="color: #59595A;">You requested a password reset for your HireFunnel account. Click the button below to set a new password. This link expires in 1 hour.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background: #FF9500; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600;">Reset password</a>
        </p>
        <p style="color: #8A8A8C; font-size: 13px;">If you didn't request this, ignore this email — your password won't change.</p>
        <p style="color: #8A8A8C; font-size: 12px; word-break: break-all;">If the button doesn't work, paste this into your browser:<br/>${resetUrl}</p>
      </div>
    `,
    text: `Reset your HireFunnel password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  })

  return NextResponse.json({ success: true })
}
