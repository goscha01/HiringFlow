import { prisma } from './prisma'
import { sendEmail, renderTemplate } from './email'

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

    // Find matching active automation rules
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType,
        OR: [
          { flowId: session.flowId },
          { flowId: null }, // Global rules (any flow)
        ],
      },
      include: { emailTemplate: true },
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

      // Build template variables
      const variables: Record<string, string> = {
        candidate_name: session.candidateName || 'Candidate',
        flow_name: session.flow.name,
        training_link: rule.nextStepType === 'training' && rule.nextStepUrl ? rule.nextStepUrl : '',
        schedule_link: rule.nextStepType === 'scheduling' && rule.nextStepUrl ? rule.nextStepUrl : '',
        source: session.source || '',
        ad_name: session.ad?.name || '',
      }

      // Render template
      const subject = renderTemplate(rule.emailTemplate.subject, variables)
      const html = renderTemplate(rule.emailTemplate.bodyHtml, variables)
      const text = rule.emailTemplate.bodyText ? renderTemplate(rule.emailTemplate.bodyText, variables) : undefined

      // Send email
      const result = await sendEmail({
        to: session.candidateEmail,
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
    }
  } catch (error) {
    console.error('[Automation] Error firing automations for session', sessionId, ':', error)
    // Never throw — email failures must not break flow completion
  }
}
