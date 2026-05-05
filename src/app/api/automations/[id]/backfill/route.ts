import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dispatchRule, scheduleBeforeMeetingReminders } from '@/lib/automation'

/**
 * Backfill a meeting-related automation rule against the workspace's existing
 * upcoming meetings — useful when a recruiter adds a new reminder rule and
 * wants it to apply to candidates who already booked.
 *
 * For each InterviewMeeting with scheduledStart > now in the workspace:
 *   - meeting_scheduled trigger → re-call dispatchRule(rule, sessionId).
 *     dispatchStep's upsert respects already-sent rows, so no duplicate sends.
 *   - before_meeting trigger    → re-call scheduleBeforeMeetingReminders for
 *     just this rule via the standard meeting_scheduled flow.
 *
 * Other triggers (flow_completed, training_completed, meeting_started/ended,
 * etc.) aren't backfillable — those events live in the past and replaying them
 * could double-send. Returns 400 for those.
 */
const BACKFILLABLE_TRIGGERS = new Set(['meeting_scheduled', 'before_meeting'])

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const rule = await prisma.automationRule.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: { id: true, name: true, triggerType: true, isActive: true, flowId: true },
  })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!rule.isActive) return NextResponse.json({ error: 'Rule is paused — activate it first' }, { status: 400 })
  if (!BACKFILLABLE_TRIGGERS.has(rule.triggerType)) {
    return NextResponse.json({
      error: `Backfill is only supported for meeting_scheduled and before_meeting triggers (this rule's trigger is "${rule.triggerType}").`,
    }, { status: 400 })
  }

  const now = new Date()
  // Find all upcoming meetings — limit by workspace AND, when the rule is
  // flow-scoped, by the session's flowId. We only need sessions with a
  // candidateEmail or candidatePhone so the executor has a recipient.
  const meetings = await prisma.interviewMeeting.findMany({
    where: {
      workspaceId: ws.workspaceId,
      scheduledStart: { gt: now },
      ...(rule.flowId ? { session: { flowId: rule.flowId } } : {}),
    },
    select: {
      id: true,
      sessionId: true,
      scheduledStart: true,
      session: { select: { id: true, candidateEmail: true, candidatePhone: true } },
    },
    orderBy: { scheduledStart: 'asc' },
  })

  let queued = 0
  let skipped = 0
  for (const m of meetings) {
    try {
      if (rule.triggerType === 'before_meeting') {
        // scheduleBeforeMeetingReminders queues every active before_meeting
        // rule's steps for this meeting — this includes the rule we're
        // backfilling. The upsert in queueStepAtDelay protects against
        // double-sending if other rules' executions already exist.
        await scheduleBeforeMeetingReminders(m.sessionId, m.scheduledStart)
      } else {
        // meeting_scheduled trigger: dispatch this specific rule against the
        // session. dispatchStep computes meeting-relative fire times against
        // the existing InterviewMeeting.scheduledStart; immediate steps with
        // timingMode='trigger' fire right away (recruiter's choice — they
        // wanted to apply the rule retroactively).
        await dispatchRule(rule.id, m.sessionId)
      }
      queued++
    } catch (err) {
      console.error('[Automation] backfill failed for session', m.sessionId, err)
      skipped++
    }
  }

  return NextResponse.json({
    rule: { id: rule.id, name: rule.name, triggerType: rule.triggerType },
    meetingsConsidered: meetings.length,
    queued,
    skipped,
  })
}
