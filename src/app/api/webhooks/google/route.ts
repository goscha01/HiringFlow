import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pullChangedEvents } from '@/lib/google'
import { processCalendarEvent } from '@/lib/google-event-processor'

// Google Calendar push notifications use these headers:
//   X-Goog-Channel-Id       — our channel ID
//   X-Goog-Channel-Token    — the secret we passed at watch time
//   X-Goog-Resource-State   — "sync" (initial) | "exists" (change) | "not_exists" (deleted)
//   X-Goog-Resource-Id      — calendar resource
export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id')
  const channelToken = request.headers.get('x-goog-channel-token')
  const resourceState = request.headers.get('x-goog-resource-state')

  console.log(`[Google webhook] hit channelId=${channelId} state=${resourceState}`)

  if (!channelId || !channelToken) {
    return NextResponse.json({ error: 'Missing channel headers' }, { status: 400 })
  }

  const integration = await prisma.googleIntegration.findUnique({
    where: { watchChannelId: channelId },
  })
  if (!integration || integration.watchToken !== channelToken) {
    return NextResponse.json({ error: 'Unknown or invalid channel' }, { status: 401 })
  }

  // Google sends a `sync` notification right after watch creation — ignore it.
  if (resourceState === 'sync') {
    return NextResponse.json({ ok: true, ignored: 'sync' })
  }

  try {
    const { events } = await pullChangedEvents(integration.workspaceId)
    for (const event of events) {
      await processCalendarEvent(integration.workspaceId, event)
    }
    return NextResponse.json({ ok: true, processed: events.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Processing failed'
    console.error('[Google webhook] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
