import { prisma } from './prisma'
import { sendEmail, renderTemplate } from './email'
import { createAccessToken, buildTrainingLink } from './training-access'
import { resolveSchedulingUrl, buildScheduleRedirectUrl, logSchedulingEvent, updatePipelineStatus } from './scheduling'
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

    const pipelineStatus = outcome === 'passed' ? 'passed' : 'completed_flow'
    await updatePipelineStatus(sessionId, pipelineStatus).catch(() => {})

    await dispatchRulesForTrigger(sessionId, triggerType, session)
  } catch (error) {
    console.error('[Automation] Error firing automations for session', sessionId, ':', error)
  }
}

export async function fireTrainingCompletedAutomations(sessionId: string) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { flow: true, ad: true },
    })
    if (!session) return
    await updatePipelineStatus(sessionId, 'training_completed').catch(() => {})
    await dispatchRulesForTrigger(sessionId, 'training_completed', session)
  } catch (error) {
    console.error('[Automation] Error firing training_completed automations for session', sessionId, ':', error)
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
    try {
      await qstash.publishJSON({
        url: `${APP_URL}/api/automations/run`,
        body: { ruleId, sessionId },
        delay: delayMinutes * 60,
      })
      console.log(`[Automation] Queued rule ${ruleId} for session ${sessionId} (delay ${delayMinutes}m)`)
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
export async function executeRule(ruleId: string, sessionId: string) {
  console.log(`[Automation] executeRule start ruleId=${ruleId} sessionId=${sessionId}`)
  const rule = await prisma.automationRule.findUnique({
    where: { id: ruleId },
    include: { emailTemplate: true, training: true, schedulingConfig: true, workspace: { select: { senderEmail: true } } },
  })
  if (!rule) { console.log(`[Automation] Rule ${ruleId} NOT FOUND`); return }
  if (!rule.isActive) { console.log(`[Automation] Rule ${ruleId} INACTIVE`); return }

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
        data: { status: 'pending', errorMessage: null },
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

  const variables: Record<string, string> = {
    candidate_name: session.candidateName || 'Candidate',
    flow_name: session.flow.name,
    training_link: trainingLink,
    schedule_link: scheduleLink,
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

  const result = await sendEmail({ to: recipient, subject, html, text })

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
