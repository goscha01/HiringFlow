/**
 * Public booking page.
 *
 * Two modes:
 *  - With ?t=<token>: per-candidate flow. Token is verified server-side and
 *    the slot picker is rendered with the candidate's prefilled info.
 *  - Without ?t=: anonymous global-link flow. Renders the IntakeForm to
 *    collect name/email; on submit /start mints a token and the page
 *    reloads with that token.
 */

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { verifyBookingToken } from '@/lib/scheduling/booking-links'
import { parseBookingRulesOrDefault } from '@/lib/scheduling/booking-rules'
import { BookingClient } from './BookingClient'
import { IntakeForm } from './_IntakeForm'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { configId: string }
  searchParams: { t?: string }
}

export default async function BookPage({ params, searchParams }: PageProps) {
  // Common: load the config; reject if it doesn't exist or isn't built-in.
  const config = await prisma.schedulingConfig.findUnique({
    where: { id: params.configId },
    select: {
      id: true,
      name: true,
      isActive: true,
      useBuiltInScheduler: true,
      bookingRules: true,
      workspace: {
        select: { name: true, logoUrl: true, senderName: true, timezone: true },
      },
    },
  })
  if (!config || !config.isActive || !config.useBuiltInScheduler) return notFound()

  // ── Anonymous flow ──
  if (!searchParams.t) {
    const rules = parseBookingRulesOrDefault(config.bookingRules)
    return (
      <IntakeForm
        configId={params.configId}
        workspaceName={config.workspace.name}
        workspaceLogo={config.workspace.logoUrl}
        configName={config.name}
        durationMinutes={rules.durationMinutes}
      />
    )
  }

  // ── Tokened flow (per-candidate or post-intake) ──
  const verified = verifyBookingToken(searchParams.t)
  if (!verified.ok) return notFound()
  if (verified.payload.purpose !== 'book') return notFound()
  if (verified.payload.configId !== params.configId) return notFound()

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
