import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeRule } from '@/lib/automation'

// Map an automation's triggerType to a reasonable starting pipeline status so
// the test candidate shows up at the stage the rule normally fires from.
const TRIGGER_TO_PIPELINE: Record<string, string> = {
  flow_completed: 'completed_flow',
  flow_passed: 'passed',
  training_completed: 'training_completed',
  meeting_scheduled: 'scheduled',
  meeting_started: 'scheduled',
  meeting_ended: 'scheduled',
  recording_ready: 'scheduled',
  transcript_ready: 'scheduled',
}

const TRIGGER_TO_OUTCOME: Record<string, string | null> = {
  flow_completed: 'completed',
  flow_passed: 'passed',
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { to } = await request.json().catch(() => ({ to: null }))
  if (!to || typeof to !== 'string') {
    return NextResponse.json({ error: 'Recipient required' }, { status: 400 })
  }

  const rule = await prisma.automationRule.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: { id: true, flowId: true, triggerType: true, emailTemplateId: true, name: true, channel: true, smsBody: true },
  })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const channel = (rule.channel as 'email' | 'sms' | undefined) || 'email'
  if (channel === 'email' && !rule.emailTemplateId) return NextResponse.json({ error: 'Email template missing' }, { status: 400 })
  if (channel === 'sms' && (!rule.smsBody || rule.smsBody.trim().length === 0)) return NextResponse.json({ error: 'SMS body missing' }, { status: 400 })

  if (channel === 'email' && !to.includes('@')) {
    return NextResponse.json({ error: 'Valid recipient email required' }, { status: 400 })
  }
  if (channel === 'sms' && !/^\+?\d[\d\s().-]{6,}$/.test(to)) {
    return NextResponse.json({ error: 'Valid recipient phone required' }, { status: 400 })
  }
  if (!rule.flowId) {
    return NextResponse.json(
      { error: 'This rule is not tied to a flow. Attach a flow so the test can create a tracked candidate record.' },
      { status: 400 },
    )
  }

  const localPart = channel === 'email' ? to.split('@')[0] : to.replace(/\D/g, '').slice(-4)
  const candidateName = `Test: ${localPart}`
  const pipelineStatus = TRIGGER_TO_PIPELINE[rule.triggerType] ?? null
  const outcome = TRIGGER_TO_OUTCOME[rule.triggerType] ?? null

  const session = await prisma.session.create({
    data: {
      workspaceId: ws.workspaceId,
      flowId: rule.flowId,
      candidateEmail: channel === 'email' ? to : null,
      candidatePhone: channel === 'sms' ? to : null,
      candidateName,
      source: 'test',
      pipelineStatus,
      outcome,
      finishedAt: outcome ? new Date() : null,
    },
  })

  // Run the rule against the real session. Uses the same code path as a real
  // trigger — renders template, sends email, writes AutomationExecution,
  // logs SchedulingEvent (if next step is scheduling), chains downstream rules.
  // ignoreActive=true so tests work on draft/inactive rules.
  try {
    await executeRule(rule.id, session.id, { ignoreActive: true })
  } catch (err) {
    // Keep the session — user can still see it in candidates. Surface the failure.
    return NextResponse.json({
      success: false,
      sessionId: session.id,
      error: err instanceof Error ? err.message : 'Automation execution failed',
    }, { status: 502 })
  }

  const execution = await prisma.automationExecution.findUnique({
    where: { automationRuleId_sessionId: { automationRuleId: rule.id, sessionId: session.id } },
    select: { status: true, errorMessage: true },
  })

  return NextResponse.json({
    success: execution?.status === 'sent',
    sessionId: session.id,
    sentTo: to,
    executionStatus: execution?.status ?? 'unknown',
    error: execution?.status !== 'sent' ? (execution?.errorMessage || 'Email was not sent') : undefined,
  })
}
