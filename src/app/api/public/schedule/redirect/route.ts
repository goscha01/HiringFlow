import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logSchedulingEvent } from '@/lib/scheduling'

export async function POST(request: NextRequest) {
  const { sessionId, configId } = await request.json()

  if (!sessionId || !configId) {
    return NextResponse.json({ error: 'sessionId and configId required' }, { status: 400 })
  }

  const config = await prisma.schedulingConfig.findUnique({ where: { id: configId } })
  if (!config || !config.isActive) {
    return NextResponse.json({ error: 'Scheduling config not found or inactive' }, { status: 404 })
  }

  // Log the click event
  await logSchedulingEvent({
    sessionId,
    schedulingConfigId: configId,
    eventType: 'link_clicked',
  }).catch((err) => console.error('[Schedule] Failed to log click:', err))

  return NextResponse.json({ redirectUrl: config.schedulingUrl })
}
