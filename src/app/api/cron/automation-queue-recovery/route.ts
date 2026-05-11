/**
 * GET /api/cron/automation-queue-recovery
 *
 * Periodic safety net for the AutomationExecution queue. Catches two
 * dangerous states that the queue itself can produce:
 *
 *   1. Torn writes during enqueue: `queueStepAtDelay` upserts the row to
 *      `status='queued', qstashMessageId=null` THEN publishes to QStash THEN
 *      writes the returned messageId. A process kill or thrown exception
 *      between the publish and the post-publish update leaves a row at
 *      `status='queued', qstashMessageId=null` for which QStash may or may
 *      not have queued a real message. Future cancellation can't delete the
 *      message because the DB doesn't know its id. We tag the row for
 *      review and let the cron decide.
 *
 *   2. Stuck `pending` rows: `executeStep` flips a row to `status='pending'`
 *      immediately before the SendGrid / Sigcore network call, and the row
 *      stays `pending` until the send completes (success → 'sent', failure
 *      → 'failed'). A serverless function timeout (Vercel default 10s,
 *      configured maxDuration=60s here) or a connectivity blip can leave a
 *      row stuck at `pending` indefinitely. Anything past ~10 minutes
 *      almost certainly didn't send and should be marked failed for the
 *      audit trail.
 *
 * Idempotent and read-mostly: only mutates rows older than the safety
 * threshold so a healthy in-flight send is never overwritten.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const STUCK_PENDING_MINUTES = 10
const STUCK_QUEUED_TORN_MINUTES = 5

// Vercel cron secret check. Same pattern as the existing crons —
// `Authorization: Bearer <secret>` is required and must match either
// CRON_SECRET (the canonical value) or VERCEL_CRON_SECRET (legacy).
function isAuthorizedCron(request: NextRequest): boolean {
  const auth = request.headers.get('authorization')
  if (!auth) return false
  const expected = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET
  if (!expected) return false
  return auth === `Bearer ${expected}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const stuckPendingCutoff = new Date(now.getTime() - STUCK_PENDING_MINUTES * 60 * 1000)
  const tornQueuedCutoff = new Date(now.getTime() - STUCK_QUEUED_TORN_MINUTES * 60 * 1000)

  // 1. Stuck pending rows — older than the send window with no terminal
  // status. Mark failed and stamp the reason; analytics can then surface
  // these as a recovery-cron signal.
  const stuckPending = await prisma.automationExecution.updateMany({
    where: {
      status: 'pending',
      createdAt: { lt: stuckPendingCutoff },
    },
    data: {
      status: 'failed',
      errorMessage: `automation-queue-recovery: stuck in pending past ${STUCK_PENDING_MINUTES}m — assumed dropped`,
    },
  })

  // 2. Torn queued rows — status='queued' AND qstashMessageId=null AND old
  // enough that the publish attempt is definitely complete (either
  // succeeded with a TX rollback losing the id, or failed entirely). Mark
  // failed so cancelPendingStepsForSession doesn't keep looking for a
  // messageId that was never persisted. If a real QStash message was
  // queued, its callback will still hit /api/automations/run, find the
  // row at 'failed', and skip safely via the guard's idempotency check
  // (which treats any terminal status as not-eligible-to-send-again).
  const tornQueued = await prisma.automationExecution.updateMany({
    where: {
      status: 'queued',
      qstashMessageId: null,
      createdAt: { lt: tornQueuedCutoff },
    },
    data: {
      status: 'failed',
      errorMessage: `automation-queue-recovery: queued without messageId past ${STUCK_QUEUED_TORN_MINUTES}m — torn enqueue`,
    },
  })

  return NextResponse.json({
    now: now.toISOString(),
    stuckPendingMarkedFailed: stuckPending.count,
    tornQueuedMarkedFailed: tornQueued.count,
  })
}
