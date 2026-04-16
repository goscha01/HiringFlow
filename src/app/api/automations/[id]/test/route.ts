import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, renderTemplate } from '@/lib/email'
import { resolveSchedulingUrl } from '@/lib/scheduling'
import { buildTrainingLink } from '@/lib/training-access'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { to } = await request.json().catch(() => ({ to: null }))
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    return NextResponse.json({ error: 'Valid recipient email required' }, { status: 400 })
  }

  const rule = await prisma.automationRule.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    include: { emailTemplate: true, training: true, workspace: { select: { senderEmail: true, senderName: true, senderDomain: true, senderDomainValidatedAt: true, senderVerifiedAt: true, name: true } }, flow: { select: { name: true } } },
  })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!rule.emailTemplate) return NextResponse.json({ error: 'Template missing' }, { status: 400 })

  // Sample links — real URLs so the buttons are clickable in the test email, but
  // not tied to any session/candidate.
  let trainingLink = ''
  if (rule.nextStepType === 'training' && rule.training) {
    trainingLink = buildTrainingLink(rule.training.slug, 'preview')
  } else if (rule.nextStepUrl) {
    trainingLink = rule.nextStepUrl
  }

  let scheduleLink = ''
  if (rule.nextStepType === 'scheduling') {
    const resolved = await resolveSchedulingUrl(rule.schedulingConfigId, ws.workspaceId).catch(() => null)
    if (resolved) scheduleLink = resolved.url
    else if (rule.nextStepUrl) scheduleLink = rule.nextStepUrl
  }

  const variables: Record<string, string> = {
    candidate_name: 'Test Candidate',
    flow_name: rule.flow?.name || 'Sample Flow',
    training_link: trainingLink,
    schedule_link: scheduleLink,
    meeting_time: 'Wednesday, April 16, 2026 at 3:00 PM',
    meeting_link: 'https://meet.google.com/sample-test-link',
    source: 'test',
    ad_name: 'Test Ad',
  }

  const subject = `[TEST] ${renderTemplate(rule.emailTemplate.subject, variables)}`
  const html = renderTemplate(rule.emailTemplate.bodyHtml, variables)
  const text = rule.emailTemplate.bodyText ? renderTemplate(rule.emailTemplate.bodyText, variables) : undefined

  // Use workspace's verified sender if available
  let from: { email: string; name?: string } | null = null
  const wsData = rule.workspace
  if (wsData?.senderEmail && wsData?.senderName) {
    const domainOk = !!(wsData.senderDomainValidatedAt && wsData.senderDomain && wsData.senderEmail.toLowerCase().endsWith('@' + wsData.senderDomain.toLowerCase()))
    const singleOk = !!wsData.senderVerifiedAt
    if (domainOk || singleOk) {
      from = { email: wsData.senderEmail, name: wsData.senderName }
    }
  }

  const result = await sendEmail({ to, subject, html, text, from })

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error || 'Send failed' }, { status: 502 })
  }
  return NextResponse.json({ success: true, messageId: result.messageId, sentTo: to })
}
