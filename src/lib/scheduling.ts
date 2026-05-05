import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Resolve the scheduling URL for a given automation rule.
 * Priority: rule's schedulingConfigId > default active config > null
 */
export async function resolveSchedulingUrl(schedulingConfigId: string | null, workspaceId?: string): Promise<{ url: string; configId: string } | null> {
  if (schedulingConfigId) {
    const config = await prisma.schedulingConfig.findUnique({ where: { id: schedulingConfigId } })
    if (config?.isActive) return { url: config.schedulingUrl, configId: config.id }
  }

  if (!workspaceId) return null

  // Fall back to default active config for this workspace
  const defaultConfig = await prisma.schedulingConfig.findFirst({
    where: { isActive: true, isDefault: true, workspaceId },
  })
  if (defaultConfig) return { url: defaultConfig.schedulingUrl, configId: defaultConfig.id }

  // Fall back to any active config in this workspace
  const anyConfig = await prisma.schedulingConfig.findFirst({
    where: { isActive: true, workspaceId },
    orderBy: { createdAt: 'asc' },
  })
  if (anyConfig) return { url: anyConfig.schedulingUrl, configId: anyConfig.id }

  return null
}

/**
 * Build a tracking redirect URL for click tracking.
 */
export function buildScheduleRedirectUrl(sessionId: string, configId: string): string {
  const appUrl = process.env.APP_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXTAUTH_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || 'http://localhost:3000'
  return `${appUrl}/schedule/redirect/${sessionId}/${configId}`
}

/**
 * Log a scheduling event.
 */
export type SchedulingEventType =
  | 'invite_sent'
  | 'link_clicked'
  | 'marked_scheduled'
  | 'meeting_scheduled'
  | 'meeting_rescheduled'
  | 'meeting_cancelled'
  // Candidate replied YES/CONFIRM to a before_meeting SMS reminder. Audit
  // entry; the InterviewMeeting.confirmedAt column is the canonical flag.
  | 'meeting_confirmed'
  // Meet integration v2 lifecycle events — driven by Google Workspace Events.
  | 'meeting_started'
  | 'meeting_ended'
  | 'meeting_no_show'
  | 'recording_ready'
  | 'transcript_ready'
  // Manual attendance import via the candidate detail page upload UI. Audit
  // record only — the lifecycle events that result are still
  // meeting_started / meeting_ended / meeting_no_show, fired by the same
  // fallback pipeline sync-on-read uses.
  | 'attendance_uploaded'

export async function logSchedulingEvent(opts: {
  sessionId: string
  schedulingConfigId?: string | null
  eventType: SchedulingEventType
  metadata?: Record<string, unknown>
}) {
  return prisma.schedulingEvent.create({
    data: {
      sessionId: opts.sessionId,
      schedulingConfigId: opts.schedulingConfigId || null,
      eventType: opts.eventType,
      metadata: opts.metadata ? (opts.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  })
}

/**
 * Update candidate pipeline status.
 */
export async function updatePipelineStatus(sessionId: string, status: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { pipelineStatus: status },
  })
}
