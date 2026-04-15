import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resendVerification } from '@/lib/sendgrid-sender'

export async function POST() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const workspace = await prisma.workspace.findUnique({
    where: { id: ws.workspaceId },
    select: { senderVerifiedId: true },
  })
  if (!workspace?.senderVerifiedId) {
    return NextResponse.json({ error: 'No sender to resend' }, { status: 400 })
  }

  try {
    await resendVerification(workspace.senderVerifiedId)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to resend' }, { status: 400 })
  }
}
