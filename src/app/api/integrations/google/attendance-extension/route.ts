/**
 * POST /api/integrations/google/attendance-extension
 *
 * Toggles `GoogleIntegration.attendanceExtensionEnabled` for the current
 * workspace. When the flag is turned ON, the response indicates whether the
 * workspace has the `spreadsheets.readonly` scope already; if not, the UI
 * surfaces a "Reconnect Google to grant Sheets access" CTA so the
 * extension's exported sheet (when found in Drive) becomes readable.
 *
 * Pure flag flip + scope-readiness probe — does not initiate OAuth itself.
 * Reconnect goes through GET /api/integrations/google/connect, which now
 * inspects this flag to decide whether to include the Sheets scope.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hasSheetsScope } from '@/lib/google'

export async function POST(req: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const body = await req.json().catch(() => ({})) as { enabled?: boolean }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled boolean required' }, { status: 400 })
  }

  const integ = await prisma.googleIntegration.findUnique({
    where: { workspaceId: ws.workspaceId },
    select: { id: true, grantedScopes: true },
  })
  if (!integ) {
    return NextResponse.json({ error: 'Connect a Google account first.' }, { status: 400 })
  }

  await prisma.googleIntegration.update({
    where: { workspaceId: ws.workspaceId },
    data: { attendanceExtensionEnabled: body.enabled },
  })

  const sheetsScopeGranted = hasSheetsScope(integ.grantedScopes)
  return NextResponse.json({
    ok: true,
    enabled: body.enabled,
    sheetsScopeGranted,
    needsReconnect: body.enabled && !sheetsScopeGranted,
  })
}
