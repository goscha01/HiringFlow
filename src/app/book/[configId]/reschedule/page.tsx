/**
 * Public candidate-facing reschedule page. Same picker as the book page,
 * different submit endpoint, and shows the current meeting time as context.
 */

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { verifyBookingToken } from '@/lib/scheduling/booking-links'
import { BookingClient } from '../BookingClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { configId: string }
  searchParams: { t?: string }
}

export default async function ReschedulePage({ params, searchParams }: PageProps) {
  const verified = verifyBookingToken(searchParams.t)
  if (!verified.ok) return notFound()
  if (verified.payload.purpose !== 'reschedule') return notFound()
  if (verified.payload.configId !== params.configId) return notFound()

  const config = await prisma.schedulingConfig.findUnique({
    where: { id: params.configId },
    select: {
      id: true, name: true, isActive: true, useBuiltInScheduler: true,
      workspace: { select: { name: true, logoUrl: true, timezone: true } },
    },
  })
  if (!config || !config.isActive || !config.useBuiltInScheduler) return notFound()

  const session = await prisma.session.findUnique({
    where: { id: verified.payload.sessionId },
    select: { id: true, candidateName: true, candidateEmail: true, candidatePhone: true },
  })
  if (!session) return notFound()

  // Surface the current meeting start so the candidate knows what they're moving from.
  const meeting = await prisma.interviewMeeting.findFirst({
    where: { sessionId: session.id, scheduledStart: { gt: new Date() } },
    orderBy: { scheduledStart: 'asc' },
    select: { scheduledStart: true },
  })

  return (
    <BookingClient
      mode="reschedule"
      configId={params.configId}
      token={searchParams.t!}
      candidateName={session.candidateName}
      candidateEmail={session.candidateEmail}
      candidatePhone={session.candidatePhone}
      workspaceName={config.workspace.name}
      workspaceLogo={config.workspace.logoUrl}
      configName={config.name}
      currentMeetingStartUtc={meeting ? meeting.scheduledStart.toISOString() : null}
    />
  )
}
