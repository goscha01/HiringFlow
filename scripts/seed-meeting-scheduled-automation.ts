/**
 * Seeds a default `meeting_scheduled` automation rule + email template so
 * candidates get a HireFunnel-branded confirmation email after booking.
 *
 * Idempotent: re-running won't create duplicates.
 */

import { prisma } from '../src/lib/prisma'

const TEMPLATE_NAME = 'Interview Confirmation'
const RULE_NAME = 'Interview confirmation (auto)'

async function main() {
  const ws = await prisma.workspace.findFirst()
  const user = await prisma.user.findFirst()
  if (!ws || !user) { console.error('no workspace/user'); process.exit(1) }

  const subject = 'Interview confirmed — {{candidate_name}}'
  const bodyHtml = `<p>Hi {{candidate_name}},</p>
<p>Your interview is confirmed for <strong>{{meeting_time}}</strong>.</p>
<p><a href="{{meeting_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Join Google Meet</a></p>
<p style="margin-top:24px;font-size:14px;color:#666;">
  Need to change time? <a href="{{reschedule_link}}" style="color:#FF9500;">Reschedule</a><br/>
  Can't make it? <a href="{{cancel_link}}" style="color:#888;">Cancel</a>
</p>
<p style="margin-top:24px;color:#888;font-size:13px;">— ${ws.name}</p>`
  const bodyText = `Hi {{candidate_name}},

Your interview is confirmed for {{meeting_time}}.

Join Google Meet: {{meeting_link}}

Need to change time? Reschedule: {{reschedule_link}}
Can't make it? Cancel: {{cancel_link}}

— ${ws.name}`

  // 1. Upsert the email template (lookup by name within workspace).
  let template = await prisma.emailTemplate.findFirst({
    where: { workspaceId: ws.id, name: TEMPLATE_NAME },
  })
  if (template) {
    template = await prisma.emailTemplate.update({
      where: { id: template.id },
      data: { subject, bodyHtml, bodyText },
    })
    console.log('Updated template:', template.id, template.name)
  } else {
    template = await prisma.emailTemplate.create({
      data: { workspaceId: ws.id, createdById: user.id, name: TEMPLATE_NAME, subject, bodyHtml, bodyText },
    })
    console.log('Created template:', template.id, template.name)
  }

  // 2. Upsert the rule (lookup by name within workspace).
  const existing = await prisma.automationRule.findFirst({
    where: { workspaceId: ws.id, name: RULE_NAME },
    include: { steps: true },
  })

  if (existing) {
    // Reset steps to one canonical email step.
    await prisma.automationStep.deleteMany({ where: { ruleId: existing.id } })
    await prisma.automationStep.create({
      data: {
        ruleId: existing.id,
        order: 0,
        delayMinutes: 0,
        channel: 'email',
        emailTemplateId: template.id,
        emailDestination: 'applicant',
      },
    })
    await prisma.automationRule.update({
      where: { id: existing.id },
      data: { isActive: true, triggerType: 'meeting_scheduled', channel: 'email' },
    })
    console.log('Updated rule:', existing.id, existing.name)
  } else {
    const rule = await prisma.automationRule.create({
      data: {
        workspaceId: ws.id,
        createdById: user.id,
        name: RULE_NAME,
        triggerType: 'meeting_scheduled',
        actionType: 'send_email',
        channel: 'email',
        isActive: true,
        steps: {
          create: {
            order: 0,
            delayMinutes: 0,
            channel: 'email',
            emailTemplateId: template.id,
            emailDestination: 'applicant',
          },
        },
      },
    })
    console.log('Created rule:', rule.id, rule.name)
  }

  console.log('\nDone. Next booking will send the confirmation email (requires SENDGRID_API_KEY).')
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1) }).finally(() => process.exit(0))
