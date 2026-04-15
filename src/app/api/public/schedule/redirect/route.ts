import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logSchedulingEvent } from '@/lib/scheduling'

export async function POST(request: NextRequest) {
  const { sessionId, configId } = await request.json()

  if (!sessionId || !configId) {
    return NextResponse.json({ error: 'sessionId and configId required' }, { status: 400 })
  }

  const [config, session] = await Promise.all([
    prisma.schedulingConfig.findUnique({ where: { id: configId } }),
    prisma.session.findUnique({
      where: { id: sessionId },
      select: { candidateName: true, candidateEmail: true },
    }),
  ])

  if (!config || !config.isActive) {
    return NextResponse.json({ error: 'Scheduling config not found or inactive' }, { status: 404 })
  }

  // Log the click event
  await logSchedulingEvent({
    sessionId,
    schedulingConfigId: configId,
    eventType: 'link_clicked',
  }).catch((err) => console.error('[Schedule] Failed to log click:', err))

  // Prefill candidate details + tracking marker.
  // Calendly / Cal.com / Google Appointments all respect name, email, and utm_content.
  const redirectUrl = buildPrefilledUrl(config.schedulingUrl, {
    name: session?.candidateName || null,
    email: session?.candidateEmail || null,
    sessionId,
  })

  return NextResponse.json({ redirectUrl })
}

function buildPrefilledUrl(base: string, opts: { name: string | null; email: string | null; sessionId: string }): string {
  try {
    const url = new URL(base)
    if (opts.name) url.searchParams.set('name', opts.name)
    if (opts.email) url.searchParams.set('email', opts.email)
    // utm_content is preserved by Calendly and written into booking metadata,
    // giving us a deterministic link back to the candidate when syncing from
    // Google Calendar or webhooks.
    url.searchParams.set('utm_content', opts.sessionId)
    url.searchParams.set('utm_source', 'hirefunnel')
    return url.toString()
  } catch {
    return base
  }
}
