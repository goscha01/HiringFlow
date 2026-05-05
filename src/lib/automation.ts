import { prisma } from './prisma'
import { sendEmail, renderTemplate } from './email'
import { sendSms, normalizeToE164, SmsConfigError, SmsValidationError, SmsSendError } from './sms'
import { createAccessToken, buildTrainingLink } from './training-access'
import { resolveSchedulingUrl, buildScheduleRedirectUrl, logSchedulingEvent, updatePipelineStatus } from './scheduling'
import { applyStageTrigger } from './funnel-stage-runtime'
import { Client } from '@upstash/qstash'

const qstashToken = process.env.QSTASH_TOKEN
const qstash = qstashToken
  ? new Client({ token: qstashToken, baseUrl: process.env.QSTASH_URL })
  : null
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.hirefunnel.app'

type SessionCtx = {
  id: string
  workspaceId: string
  flowId: string
  candidateName: string | null
  candidateEmail: string | null
  flow: { name: string }
  ad: { name: string } | null
  source: string | null
}

// Triggers that represent the "pre-meeting" phase. Any pending follow-up step
// from a rule with one of these triggers gets cancelled when the candidate
// books a meeting (meeting_scheduled fires) — the follow-up was a nudge to
// book, and they've now booked. Same idea applies on hire/reject.
const PRE_MEETING_TRIGGERS = new Set([
  'flow_completed',
  'flow_passed',
  'training_started',
  'training_completed',
])

export async function fireAutomations(sessionId: string, outcome: string) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { flow: true, ad: true },
    })
    if (!session) return

    const triggerType = outcome === 'passed' ? 'flow_passed' : outcome === 'completed' ? 'flow_completed' : null
    if (!triggerType) return

    const legacyStatus = outcome === 'passed' ? 'passed' : 'completed_flow'
    await applyStageTrigger({
      sessionId,
      workspaceId: session.workspaceId,
      event: triggerType,
      flowId: session.flowId,
      legacyStatus,
    }).catch(() => updatePipelineStatus(sessionId, legacyStatus).catch(() => {}))

    await dispatchRulesForTrigger(sessionId, triggerType, session)
  } catch (error) {
    console.error('[Automation] Error firing automations for session', sessionId, ':', error)
  }
}

export async function fireTrainingCompletedAutomations(sessionId: string, trainingId?: string) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { flow: true, ad: true },
    })
    if (!session) return
    await applyStageTrigger({
      sessionId,
      workspaceId: session.workspaceId,
      event: 'training_completed',
      trainingId,
      legacyStatus: 'training_completed',
    }).catch(() => updatePipelineStatus(sessionId, 'training_completed').catch(() => {}))
    await dispatchRulesForTrigger(sessionId, 'training_completed', session)
  } catch (error) {
    console.error('[Automation] Error firing training_completed automations for session', sessionId, ':', error)
  }
}

export async function fireTrainingStartedAutomations(sessionId: string, trainingId: string) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, workspaceId: true },
    })
    if (!session) return
    await applyStageTrigger({
      sessionId,
      workspaceId: session.workspaceId,
      event: 'training_started',
      trainingId,
      legacyStatus: 'training_in_progress',
    })
  } catch (error) {
    console.error('[Automation] Error firing training_started for session', sessionId, ':', error)
  }
}

export async function fireMeetingScheduledAutomations(sessionId: string) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { flow: true, ad: true },
    })
    if (!session) return
    await applyStageTrigger({
      sessionId,
      workspaceId: session.workspaceId,
      event: 'meeting_scheduled',
      flowId: session.flowId,
    }).catch(() => {})

    // The candidate booked. Cancel any pending follow-up steps queued by
    // pre-meeting rules ("haven't booked yet?" nudges) — they're moot now.
    await cancelPendingStepsForSession(sessionId, {
      ruleTriggerTypes: PRE_MEETING_TRIGGERS,
    }).catch((err) => console.error('[Automation] cancel pre-meeting follow-ups failed:', err))

    await dispatchRulesForTrigger(sessionId, 'meeting_scheduled', session)

    const upcoming = await prisma.interviewMeeting.findFirst({
      where: { sessionId },
      orderBy: { scheduledStart: 'desc' },
      select: { scheduledStart: true },
    })
    if (upcoming?.scheduledStart) {
      await scheduleBeforeMeetingReminders(sessionId, upcoming.scheduledStart)
    }
  } catch (error) {
    console.error('[Automation] Error firing meeting_scheduled automations for session', sessionId, ':', error)
  }
}

/**
 * Called when a calendar event is rescheduled. Cancels any pending
 * meeting-relative reminders (they were keyed off the old time) and
 * queues fresh ones for the new scheduledStart.
 *
 * Two paths re-fire:
 *  1. Legacy `before_meeting` trigger rules — handled by
 *     scheduleBeforeMeetingReminders.
 *  2. Per-step timingMode='before_meeting'/'after_meeting' on rules with
 *     other triggers (meeting_scheduled, meeting_started, etc.) — handled
 *     by reScheduleMeetingRelativeSteps.
 *
 * Already-sent steps stay sent (the upsert in dispatchStep skips them).
 */
export async function rescheduleBeforeMeetingReminders(sessionId: string, newScheduledStart: Date) {
  await cancelBeforeMeetingReminders(sessionId)
  await scheduleBeforeMeetingReminders(sessionId, newScheduledStart)
  await reScheduleMeetingRelativeSteps(sessionId)
}

/**
 * Auto-apply a rule to every upcoming meeting in the workspace whenever the
 * rule is created or edited. Cancels any pending executions for the rule
 * (across all sessions) first, then re-dispatches against each upcoming
 * InterviewMeeting.
 *
 * Only runs for meeting_scheduled and before_meeting triggers. Other triggers
 * fire on past lifecycle events that can't be safely replayed.
 *
 * Past meetings are NOT touched (where: scheduledStart > now). Already-sent
 * steps stay sent — dispatchStep's upsert skips them. The recruiter's intent
 * is "this rule should apply to candidates already booked for upcoming
 * meetings, going forward only".
 */
export async function autoBackfillRuleForUpcomingMeetings(ruleId: string) {
  const rule = await prisma.automationRule.findUnique({
    where: { id: ruleId },
    select: { id: true, workspaceId: true, triggerType: true, isActive: true, flowId: true },
  })
  if (!rule) return
  if (!['meeting_scheduled', 'before_meeting'].includes(rule.triggerType)) return

  // Cancel any pending executions for THIS rule (across all sessions). Stops
  // old QStash jobs from a prior step config from firing after an edit.
  const pending = await prisma.automationExecution.findMany({
    where: {
      automationRuleId: ruleId,
      status: { in: ['queued', 'pending'] },
    },
    select: { id: true, qstashMessageId: true },
  })
  for (const p of pending) {
    if (p.qstashMessageId && qstash) {
      try {
        await (qstash.messages as unknown as { delete: (id: string) => Promise<unknown> }).delete(p.qstashMessageId)
      } catch (err) {
        console.warn('[Automation] qstash.messages.delete failed during backfill (likely already fired):', (err as Error).message)
      }
    }
    await prisma.automationExecution.update({
      where: { id: p.id },
      data: { status: 'cancelled' },
    }).catch(() => {})
  }

  if (!rule.isActive) return

  const now = new Date()
  const meetings = await prisma.interviewMeeting.findMany({
    where: {
      workspaceId: rule.workspaceId,
      scheduledStart: { gt: now },
      ...(rule.flowId ? { session: { flowId: rule.flowId } } : {}),
    },
    select: { sessionId: true, scheduledStart: true },
    orderBy: { scheduledStart: 'asc' },
  })
  for (const m of meetings) {
    try {
      if (rule.triggerType === 'before_meeting') {
        await scheduleBeforeMeetingReminders(m.sessionId, m.scheduledStart)
      } else {
        await dispatchRule(rule.id, m.sessionId)
      }
    } catch (err) {
      console.error('[Automation] auto-backfill failed for session', m.sessionId, err)
    }
  }
}

/**
 * Find every step that has timingMode='before_meeting'/'after_meeting' on
 * a meeting-adjacent trigger and re-queue it. dispatchStep recomputes the
 * fire time against the latest InterviewMeeting.scheduledStart.
 */
async function reScheduleMeetingRelativeSteps(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { workspaceId: true, flowId: true },
  })
  if (!session) return
  const rules = await prisma.automationRule.findMany({
    where: {
      isActive: true,
      workspaceId: session.workspaceId,
      OR: [{ flowId: session.flowId }, { flowId: null }],
      triggerType: { in: ['meeting_scheduled', 'meeting_started', 'meeting_ended', 'recording_ready'] },
      steps: { some: { timingMode: { in: ['before_meeting', 'after_meeting'] } } },
    },
    select: { id: true, steps: { orderBy: { order: 'asc' } } },
  })
  for (const rule of rules) {
    for (const step of rule.steps) {
      if (step.timingMode !== 'before_meeting' && step.timingMode !== 'after_meeting') continue
      // dispatchStep's upsert respects already-sent rows, so this is safe to
      // call again after a reschedule.
      await dispatchStep(rule.id, step, sessionId).catch((err) => {
        console.error('[Automation] re-schedule of meeting-relative step failed:', err)
      })
    }
  }
}

/**
 * Generic lifecycle dispatcher for Meet integration v2 events
 * (meeting_started / meeting_ended / recording_ready / transcript_ready).
 */
export async function fireMeetingLifecycleAutomations(
  sessionId: string,
  trigger: 'meeting_started' | 'meeting_ended' | 'recording_ready' | 'transcript_ready' | 'meeting_no_show',
) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { flow: true, ad: true },
    })
    if (!session) return

    if (trigger === 'meeting_started' || trigger === 'meeting_ended' || trigger === 'meeting_no_show') {
      const legacyStatus = trigger === 'meeting_no_show' ? 'rejected' : undefined
      await applyStageTrigger({
        sessionId,
        workspaceId: session.workspaceId,
        event: trigger,
        flowId: session.flowId,
        legacyStatus,
      }).catch(() => {})

      if (trigger === 'meeting_no_show') {
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            rejectionReason: 'No-show',
            rejectionReasonAt: new Date(),
          },
        }).catch((err) => console.error('[Automation] failed to stamp rejection reason', err))
      }
    }

    if (trigger === 'recording_ready') {
      // Release any executions that were waiting on the recording. Each row
      // represents one (step, channel) pair that should now run.
      const pending = await prisma.automationExecution.findMany({
        where: { sessionId, status: 'waiting_for_recording' },
        select: { id: true, stepId: true, channel: true },
      })
      for (const e of pending) {
        if (!e.stepId) continue
        await executeStep(e.stepId, sessionId, e.channel as 'email' | 'sms').catch((err) =>
          console.error('[Automation] waiting release failed', e.id, err))
      }
    }

    if (trigger === 'meeting_ended') {
      // For meeting_ended rules, waitForRecording is a per-rule flag that
      // parks the rule's first step. (Multi-step meeting_ended rules are
      // supported but the wait only applies before step 0.)
      const rules = await prisma.automationRule.findMany({
        where: {
          isActive: true,
          triggerType: 'meeting_ended',
          workspaceId: session.workspaceId,
          OR: [{ flowId: session.flowId }, { flowId: null }],
        },
        select: {
          id: true,
          waitForRecording: true,
          steps: { orderBy: { order: 'asc' } },
        },
      })
      for (const rule of rules) {
        if (rule.steps.length === 0) continue
        if (rule.waitForRecording) {
          const cutoff = new Date(Date.now() + 4 * 60 * 60 * 1000)
          const firstStep = rule.steps[0]
          const channels = expandChannels(firstStep.channel)
          for (const channel of channels) {
            await upsertExecution({
              ruleId: rule.id,
              stepId: firstStep.id,
              sessionId,
              channel,
              status: 'waiting_for_recording',
              scheduledFor: cutoff,
            })
          }
          // Subsequent steps still queue at their delays (they don't wait).
          for (let i = 1; i < rule.steps.length; i++) {
            await dispatchStep(rule.id, rule.steps[i], sessionId)
          }
        } else {
          await dispatchRule(rule.id, sessionId)
        }
      }
      return
    }

    await dispatchRulesForTrigger(sessionId, trigger, session)
  } catch (error) {
    console.error(`[Automation] Error firing ${trigger} automations for session`, sessionId, ':', error)
  }
}

/**
 * Cancel pending step executions for a session. Used to invalidate
 * queued follow-ups when the candidate's state moves past the point at
 * which the follow-up made sense.
 *
 *   - ruleTriggerTypes: only cancel executions whose parent rule has one of
 *     these trigger types. e.g. PRE_MEETING_TRIGGERS to nuke pre-booking
 *     follow-ups when the candidate books.
 */
export async function cancelPendingStepsForSession(
  sessionId: string,
  opts?: { ruleTriggerTypes?: Set<string>; stepTimingModes?: Set<string> },
): Promise<number> {
  type Where = {
    sessionId: string
    status: { in: string[] }
    OR?: Array<Record<string, unknown>>
  }
  const where: Where = {
    sessionId,
    status: { in: ['queued', 'pending', 'waiting_for_recording'] },
  }
  const ors: Array<Record<string, unknown>> = []
  if (opts?.ruleTriggerTypes && opts.ruleTriggerTypes.size > 0) {
    ors.push({ automationRule: { triggerType: { in: Array.from(opts.ruleTriggerTypes) } } })
  }
  if (opts?.stepTimingModes && opts.stepTimingModes.size > 0) {
    ors.push({ step: { timingMode: { in: Array.from(opts.stepTimingModes) } } })
  }
  if (ors.length > 0) where.OR = ors
  const queued = await prisma.automationExecution.findMany({
    where,
    select: { id: true, qstashMessageId: true },
  })
  if (queued.length === 0) return 0
  for (const e of queued) {
    if (e.qstashMessageId && qstash) {
      try {
        await (qstash.messages as unknown as { delete: (id: string) => Promise<unknown> }).delete(e.qstashMessageId)
      } catch (err) {
        console.warn('[Automation] qstash.messages.delete failed (likely already fired):', (err as Error).message)
      }
    }
    await prisma.automationExecution.update({
      where: { id: e.id },
      data: { status: 'cancelled', errorMessage: null },
    }).catch(() => {})
  }
  return queued.length
}

async function dispatchRulesForTrigger(sessionId: string, triggerType: string, session: SessionCtx) {
  const rules = await prisma.automationRule.findMany({
    where: {
      isActive: true,
      triggerType,
      workspaceId: session.workspaceId,
      OR: [{ flowId: session.flowId }, { flowId: null }],
    },
    select: { id: true },
  })
  if (rules.length === 0) return
  console.log(`[Automation] Dispatching ${rules.length} rules for session ${sessionId} (${triggerType})`)
  for (const rule of rules) {
    await dispatchRule(rule.id, sessionId)
  }
}

/**
 * Dispatch a rule: queue every step at its configured delay. Each step
 * runs independently, but they share the same QStash callback shape so
 * cancellation / replay works the same way.
 *
 * Steps run independently (not chained sequentially); a later step does NOT
 * wait for an earlier step to complete. delayMinutes is interpreted relative
 * to the trigger event, so step 0 at delay=0 fires immediately, step 1 at
 * delay=60 fires 1h after the trigger regardless of whether step 0 succeeded.
 */
export async function dispatchRule(ruleId: string, sessionId: string) {
  const rule = await prisma.automationRule.findUnique({
    where: { id: ruleId },
    select: {
      id: true,
      steps: { orderBy: { order: 'asc' } },
    },
  })
  if (!rule) return
  if (rule.steps.length === 0) {
    console.warn(`[Automation] Rule ${ruleId} has no steps configured — skipping`)
    return
  }
  for (const step of rule.steps) {
    await dispatchStep(rule.id, step, sessionId)
  }
}

/**
 * Queue a single step for a session at its delayMinutes. Splits step.channel='both'
 * into one execution per channel.
 *
 * Timing modes:
 *  - 'trigger'        → delay seconds from NOW (default).
 *  - 'before_meeting' → fire at InterviewMeeting.scheduledStart - delayMinutes.
 *  - 'after_meeting'  → fire at InterviewMeeting.scheduledStart + delayMinutes.
 *
 * For meeting-relative modes we look up the latest InterviewMeeting attached
 * to the session. If none exists yet, fall back to 'trigger' semantics so the
 * step still fires (the recruiter set up a meeting-relative reminder for a
 * candidate without an actual meeting — better to send "now" than never).
 */
async function dispatchStep(
  ruleId: string,
  step: { id: string; delayMinutes: number; channel: string; timingMode?: string | null },
  sessionId: string,
) {
  const channels = expandChannels(step.channel)
  const mode = step.timingMode || 'trigger'
  let delaySeconds: number = step.delayMinutes * 60

  if (mode === 'before_meeting' || mode === 'after_meeting') {
    const meeting = await prisma.interviewMeeting.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      select: { scheduledStart: true },
    })
    if (meeting?.scheduledStart) {
      const nowMs = Date.now()
      const sign = mode === 'before_meeting' ? -1 : 1
      const fireAtMs = meeting.scheduledStart.getTime() + sign * step.delayMinutes * 60_000
      delaySeconds = Math.floor((fireAtMs - nowMs) / 1000)

      // For before_meeting: if the MEETING itself has already started/passed,
      // skip. Sending "X minutes before" copy after the meeting started is
      // contradictory.
      if (mode === 'before_meeting' && meeting.scheduledStart.getTime() <= nowMs) {
        console.log(`[Automation] Skipping step ${step.id} for session ${sessionId} — before_meeting requested but meeting already started/passed`)
        return
      }

      // Otherwise, if the computed fire time is in the past or imminent (the
      // recruiter just added/edited the rule mid-cycle for an upcoming
      // meeting), fire immediately rather than skip — better late than
      // missed. The 24h reminder for a meeting now 23h out goes out now.
      if (delaySeconds < 60) {
        console.log(`[Automation] Step ${step.id} (${mode}) fire time already past/imminent (${delaySeconds}s) — firing immediately for session ${sessionId}`)
        delaySeconds = 0
      }
    }
    // No meeting yet → fall through with the original delaySeconds (trigger semantics).
  }

  for (const channel of channels) {
    if (delaySeconds > 0 && qstash) {
      await queueStepAtDelay(ruleId, step.id, sessionId, channel, delaySeconds)
    } else {
      await executeStep(step.id, sessionId, channel)
    }
  }
}

/**
 * Expand a step.channel value to the channels we'll actually send on. 'both'
 * fans out into [email, sms]; the literal channel passes through.
 */
function expandChannels(channel: string): Array<'email' | 'sms'> {
  if (channel === 'both') return ['email', 'sms']
  if (channel === 'sms') return ['sms']
  return ['email']
}

/**
 * Find-or-create the AutomationExecution row for (step, session, channel).
 * Mirrors the prior single-row-per-execution model but keyed on the step.
 */
async function upsertExecution(opts: {
  ruleId: string
  stepId: string
  sessionId: string
  channel: 'email' | 'sms'
  status: string
  scheduledFor?: Date | null
}) {
  const existing = await prisma.automationExecution.findUnique({
    where: {
      stepId_sessionId_channel: {
        stepId: opts.stepId,
        sessionId: opts.sessionId,
        channel: opts.channel,
      },
    },
  })
  if (existing) {
    return prisma.automationExecution.update({
      where: { id: existing.id },
      data: {
        status: opts.status,
        scheduledFor: opts.scheduledFor ?? null,
        errorMessage: null,
        qstashMessageId: null,
      },
    })
  }
  return prisma.automationExecution.create({
    data: {
      automationRuleId: opts.ruleId,
      stepId: opts.stepId,
      sessionId: opts.sessionId,
      channel: opts.channel,
      status: opts.status,
      scheduledFor: opts.scheduledFor ?? null,
    },
  })
}

/**
 * Lower-level: queue a step+channel via QStash with an arbitrary delay.
 */
async function queueStepAtDelay(
  ruleId: string,
  stepId: string,
  sessionId: string,
  channel: 'email' | 'sms',
  delaySeconds: number,
): Promise<boolean> {
  if (!qstash || delaySeconds <= 0) {
    await executeStep(stepId, sessionId, channel)
    return false
  }
  const scheduledFor = new Date(Date.now() + delaySeconds * 1000)
  const existing = await prisma.automationExecution.findUnique({
    where: { stepId_sessionId_channel: { stepId, sessionId, channel } },
  })
  if (existing?.status === 'sent') return false
  const row = await upsertExecution({
    ruleId, stepId, sessionId, channel,
    status: 'queued',
    scheduledFor,
  })
  try {
    const res = await qstash.publishJSON({
      url: `${APP_URL}/api/automations/run`,
      body: { stepId, sessionId, channel },
      delay: delaySeconds,
    })
    const messageId = (res as { messageId?: string })?.messageId
    if (messageId) {
      await prisma.automationExecution.update({
        where: { id: row.id },
        data: { qstashMessageId: messageId },
      }).catch(() => {})
    }
    console.log(`[Automation] Queued step ${stepId} (${channel}) for session ${sessionId} (delay ${delaySeconds}s, fires ${scheduledFor.toISOString()}, qstash=${messageId ?? 'unknown'})`)
    return true
  } catch (err) {
    console.error('[Automation] QStash publish failed, running inline:', err)
    await executeStep(stepId, sessionId, channel)
    return false
  }
}

/**
 * Schedule (or re-schedule) all `before_meeting` reminder rules for a
 * session. Fires only the first step of each rule at `scheduledStart -
 * rule.minutesBefore`. Multi-step before_meeting rules are not yet exposed
 * in the UI, but if they exist, subsequent steps fire `step.delayMinutes`
 * minutes AFTER the first step's fire time (i.e. closer to / after the
 * meeting start).
 */
export async function scheduleBeforeMeetingReminders(sessionId: string, scheduledStart: Date) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { workspaceId: true, flowId: true },
    })
    if (!session) return
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: 'before_meeting',
        workspaceId: session.workspaceId,
        OR: [{ flowId: session.flowId }, { flowId: null }],
      },
      select: {
        id: true,
        minutesBefore: true,
        steps: { orderBy: { order: 'asc' } },
      },
    })
    if (rules.length === 0) return
    const now = Date.now()
    for (const rule of rules) {
      const minutesBefore = rule.minutesBefore ?? 0
      if (minutesBefore <= 0) continue
      // If the meeting itself has already started/passed, drop ALL steps for
      // this rule — sending "X before" copy after the meeting is wrong.
      if (scheduledStart.getTime() <= now) {
        console.log(`[Automation] Skipping rule ${rule.id} — meeting already started/passed`)
        continue
      }
      const firstFireAtMs = scheduledStart.getTime() - minutesBefore * 60_000
      for (let i = 0; i < rule.steps.length; i++) {
        const step = rule.steps[i]
        // Step 0 fires `minutesBefore` before the meeting; step N fires
        // step.delayMinutes minutes after step 0's fire time.
        const fireAtMs = firstFireAtMs + (i === 0 ? 0 : step.delayMinutes) * 60_000
        let delaySeconds = Math.floor((fireAtMs - now) / 1000)
        // Late reminder for an upcoming meeting → fire immediately. Better
        // late than missed.
        if (delaySeconds < 60) {
          console.log(`[Automation] Step ${step.id} fire time already past/imminent (${delaySeconds}s) — firing immediately for session ${sessionId}`)
          delaySeconds = 0
        }
        const channels = expandChannels(step.channel)
        for (const channel of channels) {
          if (delaySeconds > 0 && qstash) {
            await queueStepAtDelay(rule.id, step.id, sessionId, channel, delaySeconds)
          } else {
            await executeStep(step.id, sessionId, channel)
          }
        }
      }
    }
  } catch (err) {
    console.error('[Automation] scheduleBeforeMeetingReminders failed:', err)
  }
}

/**
 * Cancel all queued meeting-relative reminders for a session — both rules
 * with triggerType='before_meeting' (legacy rule-level model) and any step
 * whose timingMode is 'before_meeting' or 'after_meeting' (per-step model).
 *
 * Called when the calendar event is cancelled or rescheduled — both
 * scenarios invalidate the meeting-relative fire times.
 */
export async function cancelBeforeMeetingReminders(sessionId: string): Promise<number> {
  return cancelPendingStepsForSession(sessionId, {
    ruleTriggerTypes: new Set(['before_meeting']),
    stepTimingModes: new Set(['before_meeting', 'after_meeting']),
  })
}

/**
 * Execute a single step for a session on a specific channel: render content,
 * send, write the execution row, fire chained rules if this was the rule's
 * last step and the send succeeded.
 */
export async function executeStep(
  stepId: string,
  sessionId: string,
  channel: 'email' | 'sms',
  options?: { ignoreActive?: boolean },
) {
  console.log(`[Automation] executeStep start stepId=${stepId} sessionId=${sessionId} channel=${channel}`)
  const step = await prisma.automationStep.findUnique({
    where: { id: stepId },
    include: {
      emailTemplate: true,
      training: true,
      schedulingConfig: true,
      rule: {
        include: {
          workspace: { select: { senderEmail: true, senderName: true, senderVerifiedAt: true, senderDomain: true, senderDomainValidatedAt: true } },
        },
      },
    },
  })
  if (!step) { console.log(`[Automation] Step ${stepId} NOT FOUND`); return }
  const rule = step.rule
  if (!rule.isActive && !options?.ignoreActive) { console.log(`[Automation] Rule ${rule.id} INACTIVE — skipping step ${stepId}`); return }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { flow: true, ad: true },
  })
  if (!session) { console.log(`[Automation] Session ${sessionId} NOT FOUND`); return }

  const existing = await prisma.automationExecution.findUnique({
    where: { stepId_sessionId_channel: { stepId, sessionId, channel } },
  })
  if (existing && existing.status === 'sent') {
    console.log(`[Automation] Step ${stepId} already sent on ${channel} for session ${sessionId}`)
    return
  }

  const execution = await upsertExecution({
    ruleId: rule.id, stepId, sessionId, channel,
    status: 'pending',
  })

  // ─── Resolve merge tokens (training link, scheduling link, meeting info) ──
  let trainingLink = ''
  if (step.nextStepType === 'training' && step.trainingId && step.training) {
    try {
      const { token } = await createAccessToken({ sessionId, trainingId: step.trainingId, sourceRefId: rule.id })
      trainingLink = buildTrainingLink(step.training.slug, token)
    } catch (err) {
      console.error('[Automation] Failed to generate training token:', err)
      trainingLink = step.nextStepUrl || ''
    }
  } else if (step.nextStepType === 'training' && step.nextStepUrl) {
    trainingLink = step.nextStepUrl
  }

  let scheduleLink = ''
  if (step.nextStepType === 'scheduling') {
    try {
      const resolved = await resolveSchedulingUrl(step.schedulingConfigId, session.workspaceId)
      if (resolved) scheduleLink = buildScheduleRedirectUrl(sessionId, resolved.configId)
    } catch (err) {
      console.error('[Automation] Failed to resolve scheduling URL:', err)
    }
    if (!scheduleLink && step.nextStepUrl) scheduleLink = step.nextStepUrl
  }

  let meetingTime = ''
  let meetingLink = ''
  let recordingLink = ''
  let transcriptLink = ''
  let recordingStatusNote = ''

  const interviewMeeting = await prisma.interviewMeeting.findFirst({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, meetingUri: true, scheduledStart: true, recordingState: true,
      transcriptState: true, driveRecordingFileId: true, driveTranscriptFileId: true,
    },
  }).catch(() => null)

  if (interviewMeeting) {
    meetingLink = interviewMeeting.meetingUri || ''
    const d = interviewMeeting.scheduledStart
    if (d) {
      meetingTime = d.toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    }
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://www.hirefunnel.app'
    if (interviewMeeting.recordingState === 'ready' && interviewMeeting.driveRecordingFileId) {
      try {
        const { signArtifactToken } = await import('./meet/pubsub-jwt')
        const tok = signArtifactToken({
          meetingId: interviewMeeting.id,
          kind: 'recording',
          exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        })
        recordingLink = `${appUrl}/api/interview-meetings/${interviewMeeting.id}/recording?t=${encodeURIComponent(tok)}`
      } catch { /* leave empty */ }
    } else if (interviewMeeting.recordingState === 'processing' || interviewMeeting.recordingState === 'requested') {
      recordingStatusNote = 'Recording will be available shortly.'
    } else if (interviewMeeting.recordingState === 'failed' || interviewMeeting.recordingState === 'unavailable') {
      recordingStatusNote = 'Recording was not captured for this interview.'
    }
    if (interviewMeeting.transcriptState === 'ready' && interviewMeeting.driveTranscriptFileId) {
      try {
        const { signArtifactToken } = await import('./meet/pubsub-jwt')
        const tok = signArtifactToken({
          meetingId: interviewMeeting.id,
          kind: 'transcript',
          exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        })
        transcriptLink = `${appUrl}/api/interview-meetings/${interviewMeeting.id}/transcript?t=${encodeURIComponent(tok)}`
      } catch { /* leave empty */ }
    }
  } else {
    const latestMeeting = await prisma.schedulingEvent.findFirst({
      where: {
        sessionId,
        eventType: { in: ['meeting_scheduled', 'meeting_rescheduled'] },
      },
      orderBy: { eventAt: 'desc' },
      select: { metadata: true },
    })
    if (latestMeeting?.metadata) {
      const meta = latestMeeting.metadata as Record<string, unknown>
      if (typeof meta.scheduledAt === 'string') {
        const d = new Date(meta.scheduledAt)
        if (!isNaN(d.getTime())) {
          meetingTime = d.toLocaleString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
          })
        }
      }
      if (typeof meta.meetingUrl === 'string') meetingLink = meta.meetingUrl
    }
  }

  const variables: Record<string, string> = {
    candidate_name: session.candidateName || 'Candidate',
    flow_name: session.flow.name,
    training_link: trainingLink,
    schedule_link: scheduleLink,
    meeting_time: meetingTime,
    meeting_link: meetingLink,
    recording_link: recordingLink,
    transcript_link: transcriptLink,
    recording_status_note: recordingStatusNote,
    source: session.source || '',
    ad_name: session.ad?.name || '',
  }

  // ─── Send on the requested channel ─────────────────────────────────
  let result: { success: boolean; error?: string; messageId?: string }
  let provider: 'sendgrid' | 'sigcore' = 'sendgrid'

  if (channel === 'sms') {
    provider = 'sigcore'
    if (!step.smsBody || step.smsBody.trim().length === 0) {
      await prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: 'failed', errorMessage: 'SMS step has no body configured', channel, provider },
      })
      return
    }
    if (!session.candidatePhone) {
      await prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: 'failed', errorMessage: 'Candidate has no phone number — cannot send SMS', channel, provider },
      })
      return
    }
    const normalized = normalizeToE164(session.candidatePhone)
    if (!normalized) {
      await prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: 'failed', errorMessage: `Candidate phone is not E.164-normalizable: ${session.candidatePhone}`, channel, provider },
      })
      return
    }
    const body = renderTemplate(step.smsBody, variables)
    // Note: if the recruiter set "Includes link to" but the body doesn't
    // contain the matching {{xxx_link}} token, the link silently won't
    // appear. The rule editor surfaces this as an inline warning so the
    // recruiter can add the token where they want it placed.
    try {
      const sent = await sendSms({
        candidateId: sessionId,
        workspaceId: session.workspaceId,
        to: normalized,
        body,
        automationExecutionId: execution.id,
      })
      result = { success: true, messageId: sent.providerMessageId }
    } catch (err) {
      let errorMessage: string
      if (err instanceof SmsConfigError) errorMessage = `SMS not configured: ${err.message}`
      else if (err instanceof SmsValidationError) errorMessage = `SMS validation: ${err.message}`
      else if (err instanceof SmsSendError) errorMessage = `Sigcore: ${err.message}`
      else errorMessage = (err as Error).message || 'Unknown SMS error'
      result = { success: false, error: errorMessage }
    }
  } else {
    if (!step.emailTemplate) {
      await prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: 'failed', errorMessage: 'Email step has no template configured', channel, provider },
      })
      return
    }
    const subject = renderTemplate(step.emailTemplate.subject, variables)
    const html = renderTemplate(step.emailTemplate.bodyHtml, variables)
    const text: string | undefined = step.emailTemplate.bodyText ? renderTemplate(step.emailTemplate.bodyText, variables) : undefined
    // Note: if the recruiter set "Includes link to" but the template doesn't
    // contain the matching {{xxx_link}} token, the link silently won't
    // appear. The rule editor surfaces this as an inline warning so the
    // recruiter can add the token where they want it placed.

    let recipient: string | null = null
    if (step.emailDestination === 'company') recipient = rule.workspace?.senderEmail || null
    else if (step.emailDestination === 'specific') recipient = step.emailDestinationAddress || null
    else recipient = session.candidateEmail

    if (!recipient) {
      await prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: 'failed', errorMessage: `No ${step.emailDestination} email configured`, channel, provider },
      })
      return
    }

    let from: { email: string; name?: string } | null = null
    const ws = rule.workspace
    if (ws?.senderEmail && ws?.senderName) {
      const domainOk = !!(ws.senderDomainValidatedAt && ws.senderDomain && ws.senderEmail.toLowerCase().endsWith('@' + ws.senderDomain.toLowerCase()))
      const singleOk = !!ws.senderVerifiedAt
      if (domainOk || singleOk) {
        from = { email: ws.senderEmail, name: ws.senderName || undefined }
      }
    }

    result = await sendEmail({ to: recipient, subject, html, text, from })
  }

  await prisma.automationExecution.update({
    where: { id: execution.id },
    data: {
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error || null,
      providerMessageId: result.messageId || null,
      sentAt: result.success ? new Date() : null,
      channel,
      provider,
    },
  })

  if (result.success && step.nextStepType === 'scheduling') {
    const resolved = await resolveSchedulingUrl(step.schedulingConfigId).catch(() => null)
    await logSchedulingEvent({
      sessionId,
      schedulingConfigId: resolved?.configId || null,
      eventType: 'invite_sent',
      metadata: { automationRuleId: rule.id, automationStepId: step.id, executionId: execution.id },
    }).catch(() => {})
    if (rule.triggerType !== 'meeting_no_show') {
      await updatePipelineStatus(sessionId, 'invited_to_schedule').catch(() => {})
    }
  }

  // Chain: fire automation_completed rules only when the *last* step of this
  // rule has succeeded across all of its channels. Otherwise downstream rules
  // would fire mid-sequence.
  if (result.success) {
    await maybeFireChainedRules(rule.id, sessionId, session)
  }
}

/**
 * Backwards-compatible entry point: execute a rule for a session as a single
 * unit. New code should use dispatchRule instead. Kept because the test
 * harness ([id]/test/route.ts) wants to run a rule end-to-end and assert on
 * its execution status, and because the QStash callback may still be holding
 * old-shape messages with { ruleId, sessionId }.
 *
 * Runs every step inline (ignoring delay) on every channel. The `ignoreActive`
 * flag propagates to executeStep so paused rules can be tested.
 */
export async function executeRule(ruleId: string, sessionId: string, options?: { ignoreActive?: boolean }) {
  const rule = await prisma.automationRule.findUnique({
    where: { id: ruleId },
    select: { id: true, isActive: true, steps: { orderBy: { order: 'asc' } } },
  })
  if (!rule) return
  if (!rule.isActive && !options?.ignoreActive) return
  for (const step of rule.steps) {
    for (const channel of expandChannels(step.channel)) {
      await executeStep(step.id, sessionId, channel, options)
    }
  }
}

/**
 * Fire any automation_completed rules chained off the given rule, but only
 * once all of its steps' executions for this session have terminated
 * (status=sent or failed) — not while later steps are still queued. This
 * keeps "after automation X" semantics intact for multi-step parents.
 */
async function maybeFireChainedRules(ruleId: string, sessionId: string, session: SessionCtx) {
  const rule = await prisma.automationRule.findUnique({
    where: { id: ruleId },
    select: {
      id: true,
      workspaceId: true,
      steps: {
        select: {
          id: true,
          channel: true,
          executions: { where: { sessionId }, select: { id: true, status: true, channel: true } },
        },
      },
    },
  })
  if (!rule) return

  // Did every (step, channel) pair we *were going to send* land in a
  // terminal state? If any are still queued/pending/waiting, defer.
  for (const step of rule.steps) {
    const expected = expandChannels(step.channel)
    for (const ch of expected) {
      const ex = step.executions.find((e) => e.channel === ch)
      if (!ex) return
      if (ex.status !== 'sent' && ex.status !== 'failed') return
    }
  }

  const chained = await prisma.automationRule.findMany({
    where: {
      isActive: true,
      triggerType: 'automation_completed',
      triggerAutomationId: ruleId,
      workspaceId: session.workspaceId,
    },
    select: { id: true },
  })
  for (const c of chained) {
    await dispatchRule(c.id, sessionId)
  }
}
