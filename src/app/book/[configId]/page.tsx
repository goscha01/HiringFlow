/**
 * Public candidate-facing booking page. Reads `t` (signed token) from the
 * URL, verifies it server-side, and renders the slot picker.
 */

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { verifyBookingToken } from '@/lib/scheduling/booking-links'
import { BookingClient } from './BookingClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { configId: string }
  searchParams: { t?: string }
}

export default async function BookPage({ params, searchParams }: PageProps) {
  const verified = verifyBookingToken(searchParams.t)
  if (!verified.ok) return notFound()
  if (verified.payload.purpose !== 'book') return notFound()
  if (verified.payload.configId !== params.configId) return notFound()

  const config = await prisma.schedulingConfig.findUnique({
    where: { id: params.configId },
    select: {
      id: true,
      name: true,
      isActive: true,
      useBuiltInScheduler: true,
      workspace: {
        select: { name: true, logoUrl: true, senderName: true, timezone: true },
      },
    },
  })
  if (!config || !config.isActive || !config.useBuiltInScheduler) return notFound()

  const session = await prisma.session.findUnique({
    where: { id: verified.payload.sessionId },
    select: { id: true, candidateName: true, candidateEmail: true, candidatePhone: true, workspaceId: true },
  })
  if (!session) return notFound()

  return (
    <BookingClient
      configId={params.configId}
      token={searchParams.t!}
      candidateName={session.candidateName}
      candidateEmail={session.candidateEmail}
      candidatePhone={session.candidatePhone}
      workspaceName={config.workspace.name}
      workspaceLogo={config.workspace.logoUrl}
      configName={config.name}
    />
  )
}
