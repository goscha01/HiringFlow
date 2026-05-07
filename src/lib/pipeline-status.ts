/**
 * Single point of truth for `Session.pipelineStatus` mutations.
 *
 * Every place that changes pipelineStatus must go through one of these
 * helpers so the change is recorded in `pipeline_status_change`. That table
 * is the only audit trail we have for "what moved this candidate" — without
 * it, regressions look identical to manual moves and we waste hours of
 * forensics (see Stephanie Descofleur, 2026-05-06).
 *
 * Usage:
 *   - `setPipelineStatus`: read-update-audit in one call. The right tool for
 *     callers that update pipelineStatus by itself.
 *   - `recordPipelineStatusChange`: just writes the audit row. Use when the
 *     caller needs to update pipelineStatus alongside other fields in the
 *     same transactional `prisma.session.update`.
 *
 * Source tags should follow the shape `<bucket>:<detail>`:
 *   - `auto:<event>`        — applyStageTrigger fired off a system event
 *   - `manual:<surface>`    — recruiter action (patch / kanban / pipeline_button / reassign)
 *   - `scheduling:<reason>` — scheduling helper (lib/scheduling.ts)
 *   - `backfill`            — funnel-stages backfill route
 */

import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export interface RecordChangeOpts {
  sessionId: string
  fromStatus: string | null | undefined
  toStatus: string
  source: string
  triggeredBy?: string | null
  metadata?: Record<string, unknown>
}

export interface SetPipelineStatusOpts {
  sessionId: string
  toStatus: string
  source: string
  triggeredBy?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Append-only audit row. Caller has already updated Session.pipelineStatus
 * (or is about to in the same transaction). Failures here log but never
 * throw — losing an audit row should not roll back a real status change.
 */
export async function recordPipelineStatusChange(opts: RecordChangeOpts): Promise<void> {
  if (opts.fromStatus === opts.toStatus) return
  try {
    await prisma.pipelineStatusChange.create({
      data: {
        sessionId: opts.sessionId,
        fromStatus: opts.fromStatus ?? null,
        toStatus: opts.toStatus,
        source: opts.source,
        triggeredBy: opts.triggeredBy ?? null,
        metadata: opts.metadata
          ? (opts.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    })
  } catch (err) {
    console.error('[pipeline-status] failed to record change', err)
  }
}

/**
 * Read current status, write the new one, append the audit row. Returns the
 * previous status, or null if the session didn't exist. Returns the new
 * value unchanged when there's no actual change (no audit row written).
 *
 * Like the underlying prisma.session.update, this swallows nothing — if the
 * row update fails the caller hears about it. Only the audit insert is
 * fire-and-forget.
 */
export async function setPipelineStatus(opts: SetPipelineStatusOpts): Promise<string | null> {
  const before = await prisma.session.findUnique({
    where: { id: opts.sessionId },
    select: { pipelineStatus: true },
  })
  if (!before) return null
  if (before.pipelineStatus === opts.toStatus) return before.pipelineStatus
  await prisma.session.update({
    where: { id: opts.sessionId },
    data: { pipelineStatus: opts.toStatus },
  })
  await recordPipelineStatusChange({
    sessionId: opts.sessionId,
    fromStatus: before.pipelineStatus,
    toStatus: opts.toStatus,
    source: opts.source,
    triggeredBy: opts.triggeredBy,
    metadata: opts.metadata,
  })
  return before.pipelineStatus
}
