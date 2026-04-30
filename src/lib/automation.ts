import { prisma } from './prisma'
import { sendEmail, renderTemplate } from './email'
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
    // Auto-stage trigger first (overwrites legacy status if a matching stage
    // is configured); falls back to the legacy string otherwise.
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

// Fired when a candidate first opens / progresses a training. Mirrors the
// existing "training_in_progress" pipeline marker but routes through the
// stage trigger system so workspaces can map per-training started events.
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
    await dispatchRulesForTrigger(sessionId, 'meeting_scheduled', session)
  } catch (error) {
    console.error('[Automation] Error firing meeting_scheduled automations for session', sessionId, ':', error)
  }
}

/**
 * Generic lifecycle dispatcher for Meet integration v2 events
 * (meeting_started / meeting_ended / recording_ready / transcript_ready).
 * Each is a distinct automation trigger.
 *
 * For meeting_ended rules with waitForRecording=true, the rule is queued in
 * a 'waiting_for_recording' state with a 4h hard cutoff (scheduledFor). The
 * recording_ready trigger and the cron both release such queued executions.
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

    // Stage trigger for the meeting lifecycle event (covers meeting_started,
    // meeting_ended, and meeting_no_show; recording / transcript events are
    // not user-facing funnel transitions).
    if (trigger === 'meeting_started' || trigger === 'meeting_ended' || trigger === 'meeting_no_show') {
      // No-shows: default to the Rejected stage when no workspace stage is
      // wired to meeting_no_show. legacyStatus='rejected' resolves to the
      // built-in Rejected column via mapLegacyStatusToStageId.
      const legacyStatus = trigger === 'meeting_no_show' ? 'rejected' : undefined
      await applyStageTrigger({
        sessionId,
        workspaceId: session.workspaceId,
        event: trigger,
        flowId: session.flowId,
        legacyStatus,
      }).catch(() => {})

      // Stamp a rejection reason for no-shows so the candidate card shows
      // *why* they ended up in Rejected. Recruiters can edit it afterwards
      // from the candidate page.
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
      // Release any meeting_ended rules that were waiting on the recording.
      const pending = await prisma.automationExecution.findMany({
        where: { sessionId, status: 'waiting_for_recording' },
        select: { id: true, automationRuleId: true },
      })
      for (const e of pending) {
        await executeRule(e.automationRuleId, sessionId).catch((err) =>
          console.error('[Automation] waiting release failed', e.id, err))
      }
    }

    if (trigger === 'meeting_ended') {
      // Dispatch meeting_ended rules — but if waitForRecording is set on the
      // rule, park it in a 'waiting_for_recording' row with a 4h cutoff.
      const rules = await prisma.automationRule.findMany({
        where: {
          isActive: true,
          triggerType: 'meeting_ended',
          workspaceId: session.workspaceId,
          OR: [{ flowId: session.flowId }, { flowId: null }],
        },
        select: { id: true, delayMinutes: true, waitForRecording: true },
      })
      for (const rule of rules) {
        if (rule.waitForRecording) {
          const cutoff = new Date(Date.now() + 4 * 60 * 60 * 1000)
          const existing = await prisma.automationExecution.findUnique({
            where: { automationRuleId_sessionId: { automationRuleId: rule.id, sessionId } },
          })
          if (existing?.status === 'sent') continue
          if (existing) {
            await prisma.automationExecution.update({
              where: { id: existing.id },
              data: { status: 'waiting_for_recording', scheduledFor: cutoff, errorMessage: null },
            })
          } else {
            await prisma.automationExecution.create({
              data: { automationRuleId: rule.id, sessionId, status: 'waiting_for_recording', scheduledFor: cutoff },
            })
          }
        } else {
          await dispatchRule(rule.id, sessionId, rule.delayMinutes || 0)
        }
      }
      return
    }

    await dispatchRulesForTrigger(sessionId, trigger, session)
  } catch (error) {
    console.error(`[Automation] Error firing ${trigger} automations for session`, sessionId, ':', error)
  }
}

async function dispatchRulesForTrigger(sessionId: string, triggerType: string, session: SessionCtx) {
  const rules = await prisma.automationRule.findMany({
    where: {
      isActive: true,
      triggerType,
      workspaceId: session.workspaceId,
      OR: [{ flowId: session.flowId }, { flowId: null }],
    },
    select: { id: true, delayMinutes: true },
  })
  if (rules.length === 0) return
  console.log(`[Automation] Dispatching ${rules.length} rules for session ${sessionId} (${triggerType})`)
  for (const rule of rules) {
    await dispatchRule(rule.id, sessionId, rule.delayMinutes || 0)
  }
}

/**
 * Queue a rule for execution — either via QStash (delay > 0 and QStash configured)
 * or inline. Inline path is used for immediate sends and as a fallback in local dev.
 */
async function dispatchRule(ruleId: string, sessionId: string, delayMinutes: number) {
  if (delayMinutes > 0 && qstash) {
    // Record the queued execution so the candidate timeline shows the planned action.
    const scheduledFor = new Date(Date.now() + delayMinutes * 60_000)
    const existing = await prisma.automationExecution.findUnique({
      where: { automationRuleId_sessionId: { automationRuleId: ruleId, sessionId } },
    })
    if (!existing || existing.status !== 'sent') {
      if (existing) {
        await prisma.automationExecution.update({
          where: { id: existing.id },
          data: { status: 'queued', scheduledFor, errorMessage: null },
        })
      } else {
        await prisma.automationExecution.create({
          data: { automationRuleId: ruleId, sessionId, status: 'queued', scheduledFor },
        })
      }
    }
    try {
      await qstash.publishJSON({
        url: `${APP_URL}/api/automations/run`,
        body: { ruleId, sessionId },
        delay: delayMinutes * 60,
      })
      console.log(`[Automation] Queued rule ${ruleId} for session ${sessionId} (delay ${delayMinutes}m, fires ${scheduledFor.toISOString()})`)
      return
    } catch (err) {
      console.error(`[Automation] QStash publish failed, running inline:`, err)
    }
  }
  await executeRule(ruleId, sessionId)
}

/**
 * Execute a single rule for a session: render template, send email, chain.
 * Called inline for immediate rules, or from the QStash callback for delayed ones.
 */
export async function executeRule(ruleId: string, sessionId: string, options?: { ignoreActive?: boolean }) {
  console.log(`[Automation] executeRule start ruleId=${ruleId} sessionId=${sessionId}`)
  const rule = await prisma.automationRule.findUnique({
    where: { id: ruleId },
    include: { emailTemplate: true, training: true, schedulingConfig: true, workspace: { select: { senderEmail: true, senderName: true, senderVerifiedAt: true, senderDomain: true, senderDomainValidatedAt: true } } },
  })
  if (!rule) { console.log(`[Automation] Rule ${ruleId} NOT FOUND`); return }
  if (!rule.isActive && !options?.ignoreActive) { console.log(`[Automation] Rule ${ruleId} INACTIVE`); return }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { flow: true, ad: true },
  })
  if (!session) { console.log(`[Automation] Session ${sessionId} NOT FOUND`); return }

  const existing = await prisma.automationExecution.findUnique({
    where: { automationRuleId_sessionId: { automationRuleId: rule.id, sessionId } },
  })
  if (existing && existing.status === 'sent') {
    console.log(`[Automation] Rule ${rule.id} already sent for session ${sessionId}`)
    return
  }

  const execution = existing
    ? await prisma.automationExecution.update({
        where: { id: existing.id },
        data: { status: 'pending', errorMessage: null, scheduledFor: null },
      })
    : await prisma.automationExecution.create({
        data: { automationRuleId: rule.id, sessionId, status: 'pending' },
      })

  // Training link
  let trainingLink = ''
  if (rule.nextStepType === 'training' && rule.trainingId && rule.training) {
    try {
      const { token } = await createAccessToken({ sessionId, trainingId: rule.trainingId, sourceRefId: rule.id })
      trainingLink = buildTrainingLink(rule.training.slug, token)
    } catch (err) {
      console.error('[Automation] Failed to generate training token:', err)
      trainingLink = rule.nextStepUrl || ''
    }
  } else if (rule.nextStepType === 'training' && rule.nextStepUrl) {
    trainingLink = rule.nextStepUrl
  }

  // Scheduling link
  let scheduleLink = ''
  if (rule.nextStepType === 'scheduling') {
    try {
      const resolved = await resolveSchedulingUrl(rule.schedulingConfigId, session.workspaceId)
      if (resolved) scheduleLink = buildScheduleRedirectUrl(sessionId, resolved.configId)
    } catch (err) {
      console.error('[Automation] Failed to resolve scheduling URL:', err)
    }
    if (!scheduleLink && rule.nextStepUrl) scheduleLink = rule.nextStepUrl
  }

  // Meeting details — prefer the typed InterviewMeeting row for this session
  // (written by the Meet integration v2 schedule flow). Fall back to the
  // legacy SchedulingEvent.metadata JSON path so pre-v2 Calendly bookings
  // keep working.
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

  const subject = renderTemplate(rule.emailTemplate.subject, variables)
  const html = renderTemplate(rule.emailTemplate.bodyHtml, variables)
  const text = rule.emailTemplate.bodyText ? renderTemplate(rule.emailTemplate.bodyText, variables) : undefined

  let recipient: string | null = null
  if (rule.emailDestination === 'company') recipient = rule.workspace?.senderEmail || null
  else if (rule.emailDestination === 'specific') recipient = rule.emailDestinationAddress || null
  else recipient = session.candidateEmail

  if (!recipient) {
    await prisma.automationExecution.update({
      where: { id: execution.id },
      data: { status: 'failed', errorMessage: `No ${rule.emailDestination} email configured` },
    })
    return
  }

  // Use workspace's custom sender if we have a valid verification:
  //   1. Domain authentication (preferred) — any email on the validated domain
  //   2. Legacy single-sender verification — exact email that was verified
  // Otherwise fall back to the default noreply@hirefunnel.app.
  let from: { email: string; name?: string } | null = null
  const ws = rule.workspace
  if (ws?.senderEmail && ws?.senderName) {
    const domainOk = !!(ws.senderDomainValidatedAt && ws.senderDomain && ws.senderEmail.toLowerCase().endsWith('@' + ws.senderDomain.toLowerCase()))
    const singleOk = !!ws.senderVerifiedAt
    if (domainOk || singleOk) {
      from = { email: ws.senderEmail, name: ws.senderName || undefined }
    }
  }

  const result = await sendEmail({ to: recipient, subject, html, text, from })

  await prisma.automationExecution.update({
    where: { id: execution.id },
    data: {
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error || null,
      providerMessageId: result.messageId || null,
      sentAt: result.success ? new Date() : null,
    },
  })

  if (result.success && rule.nextStepType === 'scheduling') {
    const resolved = await resolveSchedulingUrl(rule.schedulingConfigId).catch(() => null)
    await logSchedulingEvent({
      sessionId,
      schedulingConfigId: resolved?.configId || null,
      eventType: 'invite_sent',
      metadata: { automationRuleId: rule.id, executionId: execution.id },
    }).catch(() => {})
    await updatePipelineStatus(sessionId, 'invited_to_schedule').catch(() => {})
  }

  // Chain: dispatch rules triggered by this one completing
  if (result.success) {
    const chained = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: 'automation_completed',
        triggerAutomationId: rule.id,
        workspaceId: session.workspaceId,
      },
      select: { id: true, delayMinutes: true },
    })
    for (const c of chained) {
      await dispatchRule(c.id, sessionId, c.delayMinutes || 0)
    }
  }
}
