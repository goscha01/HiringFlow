import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logSchedulingEvent } from '@/lib/scheduling'
import { issueBookingToken } from '@/lib/scheduling/booking-links'
import { getAppUrl } from '@/lib/google'

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

  // Log the click event regardless of which downstream provider we use.
  await logSchedulingEvent({
    sessionId,
    schedulingConfigId: configId,
    eventType: 'link_clicked',
  }).catch((err) => console.error('[Schedule] Failed to log click:', err))

  // Built-in scheduler path: issue a signed token and bounce to the in-app
  // booking page. The page re-validates the token server-side before
  // rendering slots.
  if (config.useBuiltInScheduler) {
    const token = issueBookingToken({
      sessionId,
      configId,
      purpose: 'book',
      daysFromNow: 30,
    })
    const redirectUrl = `${getAppUrl()}/book/${configId}?t=${encodeURIComponent(token)}`
    return NextResponse.json({ redirectUrl })
  }

  // External-URL path (Calendly / Cal.com / Google Appointments). All
  // respect name, email, and utm_content for prefill + downstream matching.
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
