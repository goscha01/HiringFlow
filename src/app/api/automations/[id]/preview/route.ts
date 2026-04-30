import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { renderTemplate } from '@/lib/email'
import { resolveSchedulingUrl } from '@/lib/scheduling'

/**
 * Render the email an automation rule would send, using sample variable
 * values so the recruiter can see exactly what the candidate would receive.
 *
 * No side effects: no email sent, no candidate created, no SchedulingEvent
 * logged. Useful for vetting copy before flipping the rule active.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const rule = await prisma.automationRule.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    include: {
      emailTemplate: true,
      training: { select: { id: true, slug: true, title: true } },
      schedulingConfig: { select: { id: true, name: true, schedulingUrl: true } },
      workspace: { select: { senderEmail: true, senderName: true } },
    },
  })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!rule.emailTemplate) return NextResponse.json({ error: 'Template missing' }, { status: 400 })

  // Resolve sample values for each merge token. Prefer real workspace data
  // (default scheduling URL, first training, etc.) so the preview reflects
  // what real candidates would actually see.
  const resolved = await resolveSchedulingUrl(rule.schedulingConfigId, ws.workspaceId).catch(() => null)
  const sampleScheduleLink = rule.nextStepType === 'scheduling'
    ? (resolved?.url || rule.schedulingConfig?.schedulingUrl || 'https://calendly.com/example/30min')
    : ''
  const sampleTrainingLink = rule.nextStepType === 'training' && rule.training
    ? `https://hirefunnel.app/t/${rule.training.slug}?token=SAMPLE_TOKEN`
    : (rule.nextStepUrl || '')

  // Sample meeting time = next business day, 2pm local
  const sampleMeetingTime = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(14, 0, 0, 0)
    return d.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  })()

  const variables: Record<string, string> = {
    candidate_name: 'Alex Sample',
    flow_name: 'Application Form',
    training_link: sampleTrainingLink,
    schedule_link: sampleScheduleLink,
    meeting_time: sampleMeetingTime,
    meeting_link: 'https://meet.google.com/sam-ple-xyz',
    recording_link: 'https://hirefunnel.app/api/interview-meetings/sample/recording',
    transcript_link: 'https://hirefunnel.app/api/interview-meetings/sample/transcript',
    recording_status_note: '',
    source: 'preview',
    ad_name: 'Sample ad',
  }

  const subject = renderTemplate(rule.emailTemplate.subject, variables)
  const html = renderTemplate(rule.emailTemplate.bodyHtml, variables)
  const text = rule.emailTemplate.bodyText ? renderTemplate(rule.emailTemplate.bodyText, variables) : null

  const recipient = rule.emailDestination === 'company'
    ? (rule.workspace?.senderEmail || 'company@example.com')
    : rule.emailDestination === 'specific'
      ? (rule.emailDestinationAddress || 'specific@example.com')
      : 'alex.sample@example.com'

  const fromAddress = rule.workspace?.senderEmail || 'no-reply@hirefunnel.app'
  const fromName = rule.workspace?.senderName || 'HireFunnel'

  return NextResponse.json({
    subject,
    html,
    text,
    recipient,
    from: { name: fromName, email: fromAddress },
    templateName: rule.emailTemplate.name,
    variables,
  })
}
