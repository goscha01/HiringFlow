import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { buildConsentUrl } from '@/lib/google'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  // State token ties callback back to this workspace + prevents CSRF
  const state = randomBytes(16).toString('hex')
  cookies().set(`goog_oauth_${state}`, ws.workspaceId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  // Only request the Sheets readonly scope when the workspace has opted into
  // the attendance-extension fallback — keeps the consent screen minimal for
  // the common case and avoids re-prompting workspaces that don't use it.
  const integ = await prisma.googleIntegration.findUnique({
    where: { workspaceId: ws.workspaceId },
    select: { attendanceExtensionEnabled: true },
  })

  try {
    const url = buildConsentUrl(state, { includeSheets: !!integ?.attendanceExtensionEnabled })
    return NextResponse.redirect(url)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'OAuth not configured' }, { status: 500 })
  }
}
