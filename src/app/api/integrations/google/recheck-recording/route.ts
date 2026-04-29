import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hasMeetScopes } from '@/lib/google'
import { probeRecordingCapability, capabilityMessage } from '@/lib/meet/recording-capability'
import type { RecordingCapabilityReason } from '@/lib/meet/recording-capability'

export async function POST() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const integration = await prisma.googleIntegration.findUnique({
    where: { workspaceId: ws.workspaceId },
    select: { grantedScopes: true },
  })
  if (!integration) {
    return NextResponse.json({ error: 'Google is not connected.' }, { status: 400 })
  }
  if (!hasMeetScopes(integration.grantedScopes)) {
    return NextResponse.json({
      error: 'Meet scopes not granted. Reconnect Google to grant the recording permissions.',
      needsReconnect: true,
    }, { status: 400 })
  }

  const result = await probeRecordingCapability(ws.workspaceId)
  return NextResponse.json({
    capable: result.capable,
    reason: result.reason,
    message: capabilityMessage(result.reason as RecordingCapabilityReason),
    checkedAt: result.checkedAt,
  })
}
