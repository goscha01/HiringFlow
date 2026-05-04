import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Seeds a default "Candidate no-show follow-up" email template + AutomationRule
 * for the workspace. Idempotent: if a meeting_no_show rule already exists, no
 * new rule is created (we return the existing one). Safe to call multiple times.
 *
 * Defaults:
 *   - emailDestination: applicant
 *   - delayMinutes: 0 (immediate)
 *   - nextStepType: scheduling (uses default workspace SchedulingConfig if any,
 *     so the email contains a {{schedule_link}} that lets the candidate re-book)
 *   - isActive: true
 */
const DEFAULT_TEMPLATE_NAME = 'Candidate no-show — re-book invite'
const DEFAULT_RULE_NAME = 'No-show follow-up'

const DEFAULT_SUBJECT = 'We missed you — pick a new interview time'

const DEFAULT_BODY_HTML = `<p>Hi {{candidate_name}},</p>
<p>We were expecting you for your interview but did not see you on the call.</p>
<p>If something came up, that's okay — pick a new time that works for you below and we'll get back on track:</p>
<p><a href="{{schedule_link}}">Re-book your interview</a></p>
<p>If you no longer want to move forward, no further action is needed.</p>
<p>Talk soon,<br/>The hiring team</p>`

const DEFAULT_BODY_TEXT = `Hi {{candidate_name}},

We were expecting you for your interview but did not see you on the call.

If something came up, that's okay — pick a new time that works for you here:
{{schedule_link}}

If you no longer want to move forward, no further action is needed.

Talk soon,
The hiring team`

export async function POST() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const existingRule = await prisma.automationRule.findFirst({
    where: { workspaceId: ws.workspaceId, triggerType: 'meeting_no_show' },
    include: { emailTemplate: { select: { id: true, name: true } } },
  })
  if (existingRule) {
    return NextResponse.json({ created: false, ruleId: existingRule.id, templateId: existingRule.emailTemplateId })
  }

  let template = await prisma.emailTemplate.findFirst({
    where: { workspaceId: ws.workspaceId, name: DEFAULT_TEMPLATE_NAME },
    select: { id: true },
  })
  if (!template) {
    template = await prisma.emailTemplate.create({
      data: {
        workspaceId: ws.workspaceId,
        createdById: ws.userId,
        name: DEFAULT_TEMPLATE_NAME,
        subject: DEFAULT_SUBJECT,
        bodyHtml: DEFAULT_BODY_HTML,
        bodyText: DEFAULT_BODY_TEXT,
        isActive: true,
      },
      select: { id: true },
    })
  }

  // Use the workspace's default scheduling config so the email's
  // {{schedule_link}} resolves automatically. If none configured, the link
  // will render empty — recruiters can still wire one in via the rule editor.
  const defaultSchedConfig = await prisma.schedulingConfig.findFirst({
    where: { workspaceId: ws.workspaceId, isDefault: true, isActive: true },
    select: { id: true },
  })

  const rule = await prisma.automationRule.create({
    data: {
      workspaceId: ws.workspaceId,
      createdById: ws.userId,
      name: DEFAULT_RULE_NAME,
      triggerType: 'meeting_no_show',
      // Legacy mirror fields. Source of truth is the step row below.
      emailTemplateId: template.id,
      emailDestination: 'applicant',
      nextStepType: defaultSchedConfig ? 'scheduling' : null,
      schedulingConfigId: defaultSchedConfig?.id ?? null,
      delayMinutes: 0,
      isActive: true,
      steps: {
        create: [{
          order: 0,
          delayMinutes: 0,
          channel: 'email',
          emailTemplateId: template.id,
          emailDestination: 'applicant',
          nextStepType: defaultSchedConfig ? 'scheduling' : null,
          schedulingConfigId: defaultSchedConfig?.id ?? null,
        }],
      },
    },
    select: { id: true },
  })

  return NextResponse.json({ created: true, ruleId: rule.id, templateId: template.id })
}
