import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeRule } from '@/lib/automation'

// Manually fire all active `before_meeting` reminder rules for this candidate
// right now, ignoring their scheduled fire time. Useful when the recruiter
// wants to nudge a candidate ahead of the configured reminder cadence.
//
// GET returns the matched rules (so the UI can show a count); POST fires them.
// Requires an upcoming meeting — without one, the {{meeting_time}} /
// {{meeting_link}} merge tokens render empty and the email is meaningless.

interface MatchedRule { id: string; name: string; isActive: boolean }

async function loadContext(sessionId: string, workspaceId: string) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, workspaceId },
    select: { id: true, flowId: true },
  })
  if (!session) return { session: null, hasUpcoming: false, rules: [] as MatchedRule[] }

  const now = new Date()
  let hasUpcoming = !!(await prisma.interviewMeeting.findFirst({
    where: { sessionId: session.id, scheduledStart: { gt: now } },
    select: { id: true },
  }))
  if (!hasUpcoming) {
    const evt = await prisma.schedulingEvent.findFirst({
      where: { sessionId: session.id, eventType: { in: ['meeting_scheduled', 'meeting_rescheduled'] } },
      orderBy: { eventAt: 'desc' },
      select: { metadata: true },
    })
    const scheduledAt = (evt?.metadata as Record<string, unknown> | null)?.scheduledAt
    if (typeof scheduledAt === 'string') {
      const d = new Date(scheduledAt)
      if (!isNaN(d.getTime()) && d > now) hasUpcoming = true
    }
  }

  const rules = await prisma.automationRule.findMany({
    where: {
      workspaceId,
      triggerType: 'before_meeting',
      isActive: true,
      OR: [{ flowId: session.flowId }, { flowId: null }],
    },
    select: { id: true, name: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  return { session, hasUpcoming, rules }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { session, hasUpcoming, rules } = await loadContext(params.id, ws.workspaceId)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ hasUpcoming, rules })
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { session, hasUpcoming, rules } = await loadContext(params.id, ws.workspaceId)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!hasUpcoming) {
    return NextResponse.json({ error: 'No upcoming meeting — schedule one before sending a reminder.' }, { status: 400 })
  }
  if (rules.length === 0) {
    return NextResponse.json({ error: 'No active before-meeting reminder rules configured for this flow.' }, { status: 400 })
  }

  const results: Array<{ ruleId: string; name: string; ok: boolean; error?: string }> = []
  for (const rule of rules) {
    try {
      await executeRule(rule.id, session.id)
      results.push({ ruleId: rule.id, name: rule.name, ok: true })
    } catch (err) {
      results.push({
        ruleId: rule.id,
        name: rule.name,
        ok: false,
        error: err instanceof Error ? err.message : 'Execution failed',
      })
    }
  }
  return NextResponse.json({ fired: results.filter((r) => r.ok).length, results })
}
