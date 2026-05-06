/**
 * Order a Certn case for a Session and persist the BackgroundCheck row.
 *
 * Used by:
 *   - The "Order background check" button on the candidate detail page
 *     (surfaces the invite_link directly to the recruiter).
 *   - The automation engine, when a step has nextStepType='background_check'
 *     (renders the link into the {{certn_link}} merge token).
 *
 * Idempotent at the (session, integration) level: if there's already an
 * active (non-terminal) BackgroundCheck for the session, we return it
 * instead of creating a new one. This is what stops a misconfigured
 * automation from spamming Certn (and double-billing the customer).
 */

import { prisma } from '../prisma'
import {
  CertnConfigError,
  isTerminalStatus,
  orderCase,
  resolveClient,
} from './client'

export interface OrderForSessionInput {
  sessionId: string
  // Optional override; falls back to integration.defaultCheckTypes.
  checkTypesWithArguments?: Record<string, Record<string, unknown>>
  orderedById?: string | null
}

export interface OrderForSessionResult {
  backgroundCheck: {
    id: string
    certnCaseId: string
    inviteLink: string | null
    status: string
    createdAt: Date
  }
  reused: boolean  // true if we returned an existing non-terminal row
}

export async function orderForSession(input: OrderForSessionInput): Promise<OrderForSessionResult> {
  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: { id: true, workspaceId: true, candidateEmail: true, candidateName: true },
  })
  if (!session) throw new Error(`Session ${input.sessionId} not found`)
  if (!session.candidateEmail) {
    throw new CertnConfigError('Candidate has no email address — cannot order a Certn check')
  }

  const client = await resolveClient(session.workspaceId)

  const checkTypes =
    input.checkTypesWithArguments && Object.keys(input.checkTypesWithArguments).length > 0
      ? input.checkTypesWithArguments
      : client.defaultCheckTypes

  if (!checkTypes || Object.keys(checkTypes).length === 0) {
    throw new CertnConfigError('No check types configured — set defaults in Certn settings or pass an override')
  }

  // Reuse an active check if one already exists for this session. Treats any
  // non-terminal status as active.
  const existing = await prisma.backgroundCheck.findFirst({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'desc' },
  })
  if (existing && !isTerminalStatus(existing.status)) {
    return {
      backgroundCheck: {
        id: existing.id,
        certnCaseId: existing.certnCaseId,
        inviteLink: existing.inviteLink,
        status: existing.status,
        createdAt: existing.createdAt,
      },
      reused: true,
    }
  }

  const ordered = await orderCase(client, {
    emailAddress: session.candidateEmail,
    checkTypesWithArguments: checkTypes,
    expiryDays: client.inviteExpiryDays,
  })

  const created = await prisma.backgroundCheck.create({
    data: {
      workspaceId: session.workspaceId,
      sessionId: session.id,
      integrationId: client.integrationId,
      certnCaseId: ordered.id,
      inviteLink: ordered.invite_link ?? null,
      status: (ordered.overall_status || 'CASE_ORDERED').toUpperCase(),
      checkTypes: checkTypes as object,
      orderedById: input.orderedById ?? null,
    },
  })

  return {
    backgroundCheck: {
      id: created.id,
      certnCaseId: created.certnCaseId,
      inviteLink: created.inviteLink,
      status: created.status,
      createdAt: created.createdAt,
    },
    reused: false,
  }
}
