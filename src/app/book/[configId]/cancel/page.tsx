/**
 * Public candidate-facing cancel page. Verifies the signed token server-side
 * (so a bad/expired URL 404s without exposing the cancel button), then renders
 * a small confirm-cancel UI that POSTs to /api/public/booking/[configId]/cancel.
 */

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { verifyBookingToken, issueBookingToken } from '@/lib/scheduling/booking-links'
import { CancelClient } from './CancelClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { configId: string }
  searchParams: { t?: string }
}

export default async function CancelPage({ params, searchParams }: PageProps) {
  const verified = verifyBookingToken(searchParams.t)
  if (!verified.ok) return notFound()
  if (verified.payload.purpose !== 'cancel') return notFound()
  if (verified.payload.configId !== params.configId) return notFound()

  const config = await prisma.schedulingConfig.findUnique({
    where: { id: params.configId },
    select: {
      id: true, name: true, isActive: true, useBuiltInScheduler: true,
      workspace: { select: { name: true, logoUrl: true, timezone: true } },
    },
  })
  if (!config || !config.isActive || !config.useBuiltInScheduler) return notFound()

  const meeting = await prisma.interviewMeeting.findFirst({
    where: { sessionId: verified.payload.sessionId, scheduledStart: { gt: new Date() } },
    orderBy: { scheduledStart: 'asc' },
    select: { scheduledStart: true, scheduledEnd: true, meetingUri: true },
  })

  // Issue a reschedule token with the same expiry as the cancel token so the
  // candidate can pick "Reschedule instead" without re-emailing.
  const rescheduleToken = issueBookingToken({
    sessionId: verified.payload.sessionId,
    configId: params.configId,
    purpose: 'reschedule',
    expiresAt: verified.payload.expiresAt,
  })

  return (
    <CancelClient
      configId={params.configId}
      token={searchParams.t!}
      rescheduleToken={rescheduleToken}
      workspaceName={config.workspace.name}
      workspaceLogo={config.workspace.logoUrl}
      configName={config.name}
      meetingStartUtc={meeting ? meeting.scheduledStart.toISOString() : null}
      meetingDurationMinutes={meeting ? Math.round((meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()) / 60_000) : 30}
    />
  )
}
