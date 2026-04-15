import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stopWatch } from '@/lib/google'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const integration = await prisma.googleIntegration.findUnique({
    where: { workspaceId: ws.workspaceId },
    select: {
      googleEmail: true,
      calendarId: true,
      watchExpiresAt: true,
      lastSyncedAt: true,
      createdAt: true,
    },
  })

  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

  return NextResponse.json({
    configured,
    connected: !!integration,
    integration,
  })
}

export async function DELETE() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  await stopWatch(ws.workspaceId).catch(() => {})
  await prisma.googleIntegration.delete({ where: { workspaceId: ws.workspaceId } }).catch(() => {})

  return NextResponse.json({ success: true })
}
