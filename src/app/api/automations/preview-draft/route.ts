import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { renderTemplate } from '@/lib/email'
import { resolveSchedulingUrl } from '@/lib/scheduling'
import { appendConfirmCancelHint } from '@/lib/sms'

/**
 * Preview an UNSAVED automation step. Used by the rule editor modal so
 * recruiters can vet copy before committing the rule to the DB.
 *
 * Mirrors the saved-rule preview endpoint at /api/automations/[id]/preview
 * but reads the step config from the request body instead of from a
 * persisted AutomationRuleStep.
 *
 * Body:
 *   {
 *     channel: 'email' | 'sms',
 *     emailTemplateId?: string,
 *     smsBody?: string,
 *     nextStepType?: 'training' | 'scheduling' | 'meet_link' | null,
 *     trainingId?: string,
 *     schedulingConfigId?: string,
 *     emailDestination?: 'applicant' | 'company' | 'specific',
 *     emailDestinationAddress?: string,
 *   }
 *
 * No side effects: nothing is sent or persisted.
 */
export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const body = await request.json().catch(() => null) as {
    channel?: 'email' | 'sms'
    emailTemplateId?: string | null
    smsBody?: string | null
    nextStepType?: 'training' | 'scheduling' | 'meet_link' | null
    trainingId?: string | null
    schedulingConfigId?: string | null
    emailDestination?: 'applicant' | 'company' | 'specific'
    emailDestinationAddress?: string | null
    // Caller passes these so the preview can mirror executeStep's
    // reminder-tail auto-append. Unset → the hint is NOT shown.
    triggerType?: string | null
    timingMode?: string | null
  } | null
  if (!body) return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })

  const channel = body.channel === 'sms' ? 'sms' : 'email'
  if (channel === 'sms' && (!body.smsBody || body.smsBody.trim().length === 0)) {
    return NextResponse.json({ error: 'SMS body is empty' }, { status: 400 })
  }
  if (channel === 'email' && !body.emailTemplateId) {
    return NextResponse.json({ error: 'Email template required' }, { status: 400 })
  }

  // Load workspace + (for email) the chosen template — both scoped to the
  // caller's workspace so you can't preview templates you don't own.
  const workspace = await prisma.workspace.findUnique({
    where: { id: ws.workspaceId },
    select: { senderEmail: true, senderName: true, timezone: true },
  })
  const template = channel === 'email' && body.emailTemplateId
    ? await prisma.emailTemplate.findFirst({
        where: { id: body.emailTemplateId, workspaceId: ws.workspaceId },
        select: { id: true, name: true, subject: true, bodyHtml: true, bodyText: true },
      })
    : null
  if (channel === 'email' && !template) {
    return NextResponse.json({ error: 'Email template not found in this workspace' }, { status: 404 })
  }

  const training = body.nextStepType === 'training' && body.trainingId
    ? await prisma.training.findFirst({
        where: { id: body.trainingId, workspaceId: ws.workspaceId },
        select: { id: true, slug: true, title: true },
      })
    : null
  const schedulingConfig = body.nextStepType === 'scheduling' && body.schedulingConfigId
    ? await prisma.schedulingConfig.findFirst({
        where: { id: body.schedulingConfigId, workspaceId: ws.workspaceId },
        select: { id: true, name: true, schedulingUrl: true },
      })
    : null

  const resolved = await resolveSchedulingUrl(body.schedulingConfigId ?? null, ws.workspaceId).catch(() => null)
  const sampleScheduleLink = body.nextStepType === 'scheduling'
    ? (resolved?.url || schedulingConfig?.schedulingUrl || 'https://calendly.com/example/30min')
    : ''
  const sampleTrainingLink = body.nextStepType === 'training' && training
    ? `https://hirefunnel.app/t/${training.slug}?token=SAMPLE_TOKEN`
    : ''

  const workspaceTz = workspace?.timezone || 'America/New_York'
  const sampleMeetingTime = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(14, 0, 0, 0)
    return d.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: workspaceTz,
      timeZoneName: 'short',
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

  if (channel === 'sms') {
    const renderedBody = renderTemplate(body.smsBody as string, variables)
    const isReminder = body.triggerType === 'before_meeting' || body.timingMode === 'before_meeting'
    const finalBody = isReminder ? appendConfirmCancelHint(renderedBody) : renderedBody
    return NextResponse.json({
      channel,
      smsBody: finalBody,
      replyHintAppended: isReminder && finalBody !== renderedBody,
      recipient: '+15551230000',
      from: { name: 'HireFunnel SMS', email: 'sigcore-pool' },
      templateName: 'SMS body',
      variables,
      length: finalBody.length,
      segments: Math.max(1, Math.ceil(finalBody.length / 160)),
    })
  }

  const subject = renderTemplate(template!.subject, variables)
  const html = renderTemplate(template!.bodyHtml, variables)
  const text = template!.bodyText ? renderTemplate(template!.bodyText, variables) : null

  const recipient = body.emailDestination === 'company'
    ? (workspace?.senderEmail || 'company@example.com')
    : body.emailDestination === 'specific'
      ? (body.emailDestinationAddress || 'specific@example.com')
      : 'alex.sample@example.com'

  const fromAddress = workspace?.senderEmail || 'no-reply@hirefunnel.app'
  const fromName = workspace?.senderName || 'HireFunnel'

  return NextResponse.json({
    channel,
    subject,
    html,
    text,
    recipient,
    from: { name: fromName, email: fromAddress },
    templateName: template!.name,
    variables,
  })
}
