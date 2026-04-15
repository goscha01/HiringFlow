import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSchedulingEvent, updatePipelineStatus } from '@/lib/scheduling'
import { fireMeetingScheduledAutomations } from '@/lib/automation'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { scheduledAt, meetingUrl, notes, schedulingConfigId } = await request.json()
  if (!scheduledAt || isNaN(new Date(scheduledAt).getTime())) {
    return NextResponse.json({ error: 'Valid scheduledAt (ISO string) required' }, { status: 400 })
  }

  let configId: string | null = schedulingConfigId || null
  if (!configId) {
    const defaultConfig = await prisma.schedulingConfig.findFirst({
      where: { workspaceId: ws.workspaceId, isActive: true, isDefault: true },
      select: { id: true },
    })
    configId = defaultConfig?.id || null
  }

  await logSchedulingEvent({
    sessionId: params.id,
    schedulingConfigId: configId,
    eventType: 'meeting_scheduled',
    metadata: {
      scheduledAt: new Date(scheduledAt).toISOString(),
      meetingUrl: meetingUrl || null,
      notes: notes || null,
      source: 'manual',
      loggedBy: ws.userId,
    },
  })

  await updatePipelineStatus(params.id, 'scheduled').catch(() => {})

  // Fire any meeting_scheduled automations (e.g., send candidate a confirmation)
  await fireMeetingScheduledAutomations(params.id).catch((err) => {
    console.error('[Schedule-meeting] fireMeetingScheduledAutomations failed:', err)
  })

  return NextResponse.json({ success: true })
}
