import { prisma } from './prisma'
import { sendEmail, renderTemplate } from './email'
import { createAccessToken, buildTrainingLink } from './training-access'
import { resolveSchedulingUrl, buildScheduleRedirectUrl, logSchedulingEvent, updatePipelineStatus } from './scheduling'

/**
 * Fire automations for a session outcome change.
 * Called when session.outcome is set to 'completed' or 'passed'.
 *
 * This runs async — errors are caught and logged, never break flow completion.
 */
export async function fireAutomations(sessionId: string, outcome: string) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        flow: true,
        ad: true,
      },
    })

    if (!session) return
    if (!session.candidateEmail) {
      console.log('[Automation] No candidate email — skipping for session', sessionId)
      return
    }

    // Map outcome to trigger type
    const triggerType = outcome === 'passed' ? 'flow_passed' : outcome === 'completed' ? 'flow_completed' : null
    if (!triggerType) return

    // Update pipeline status
    const pipelineStatus = outcome === 'passed' ? 'passed' : 'completed_flow'
    await updatePipelineStatus(sessionId, pipelineStatus).catch(() => {})

    await executeRulesForTrigger(sessionId, triggerType, session)
  } catch (error) {
    console.error('[Automation] Error firing automations for session', sessionId, ':', error)
  }
}

/**
 * Fire automations when training is completed.
 * Called from the training progress completion endpoint.
 */
export async function fireTrainingCompletedAutomations(sessionId: string) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        flow: true,
        ad: true,
      },
    })

    if (!session) return
    if (!session.candidateEmail) {
      console.log('[Automation] No candidate email — skipping training_completed for session', sessionId)
      return
    }

    // Update pipeline status
    await updatePipelineStatus(sessionId, 'training_completed').catch(() => {})

    await executeRulesForTrigger(sessionId, 'training_completed', session)
  } catch (error) {
    console.error('[Automation] Error firing training_completed automations for session', sessionId, ':', error)
  }
}

/**
 * Core automation execution for any trigger type.
 */
async function executeRulesForTrigger(
  sessionId: string,
  triggerType: string,
  session: { id: string; workspaceId: string; flowId: string; candidateName: string | null; candidateEmail: string | null; flow: { name: string }; ad: { name: string } | null; source: string | null }
) {
  // Find matching active automation rules — scoped to candidate's workspace
  const rules = await prisma.automationRule.findMany({
    where: {
      isActive: true,
      triggerType,
      workspaceId: session.workspaceId,
      OR: [
        { flowId: session.flowId },
        { flowId: null }, // Workspace-wide rules (any flow)
      ],
    },
    include: { emailTemplate: true, training: true, schedulingConfig: true },
  })

  if (rules.length === 0) return

  console.log(`[Automation] Found ${rules.length} rules for session ${sessionId} (${triggerType})`)

  for (const rule of rules) {
    // Check for duplicate execution
    const existing = await prisma.automationExecution.findUnique({
      where: { automationRuleId_sessionId: { automationRuleId: rule.id, sessionId } },
    })

    if (existing) {
      console.log(`[Automation] Already executed rule ${rule.id} for session ${sessionId} — skipping`)
      continue
    }

    // Create execution record (pending)
    const execution = await prisma.automationExecution.create({
      data: {
        automationRuleId: rule.id,
        sessionId,
        status: 'pending',
      },
    })

    // Build training link with token if this rule links to a training
    let trainingLink = ''
    if (rule.nextStepType === 'training' && rule.trainingId && rule.training) {
      try {
        const { token } = await createAccessToken({
          sessionId,
          trainingId: rule.trainingId,
          sourceRefId: rule.id,
        })
        trainingLink = buildTrainingLink(rule.training.slug, token)
        console.log(`[Automation] Generated training token for session ${sessionId}, training ${rule.training.slug}`)
      } catch (err) {
        console.error('[Automation] Failed to generate training token:', err)
        trainingLink = rule.nextStepUrl || ''
      }
    } else if (rule.nextStepType === 'training' && rule.nextStepUrl) {
      trainingLink = rule.nextStepUrl
    }

    // Build scheduling link from config
    let scheduleLink = ''
    if (rule.nextStepType === 'scheduling') {
      try {
        const resolved = await resolveSchedulingUrl(rule.schedulingConfigId, session.workspaceId)
        if (resolved) {
          // Use click-tracking redirect URL
          scheduleLink = buildScheduleRedirectUrl(sessionId, resolved.configId)
        }
      } catch (err) {
        console.error('[Automation] Failed to resolve scheduling URL:', err)
      }
      // Fallback to manual URL
      if (!scheduleLink && rule.nextStepUrl) {
        scheduleLink = rule.nextStepUrl
      }
    }

    // Build template variables
    const variables: Record<string, string> = {
      candidate_name: session.candidateName || 'Candidate',
      flow_name: session.flow.name,
      training_link: trainingLink,
      schedule_link: scheduleLink,
      source: session.source || '',
      ad_name: session.ad?.name || '',
    }

    // Render template
    const subject = renderTemplate(rule.emailTemplate.subject, variables)
    const html = renderTemplate(rule.emailTemplate.bodyHtml, variables)
    const text = rule.emailTemplate.bodyText ? renderTemplate(rule.emailTemplate.bodyText, variables) : undefined

    // Send email
    const result = await sendEmail({
      to: session.candidateEmail!,
      subject,
      html,
      text,
    })

    // Update execution record
    await prisma.automationExecution.update({
      where: { id: execution.id },
      data: {
        status: result.success ? 'sent' : 'failed',
        errorMessage: result.error || null,
        providerMessageId: result.messageId || null,
        sentAt: result.success ? new Date() : null,
      },
    })

    // Log scheduling event and update pipeline if scheduling email sent
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
  }
}
