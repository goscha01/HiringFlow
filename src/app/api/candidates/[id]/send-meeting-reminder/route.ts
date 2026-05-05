import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeRule } from '@/lib/automation'

// Manually fire all active `before_meeting` reminder rules for this candidate
// right now, ignoring their scheduled fire time. Used when the recruiter
// wants to nudge a candidate ahead of the configured cadence — including
// "the meeting started but they haven't joined" no-show nudges.
//
// GET returns the matched rules (so the UI can show a count); POST fires them.
// Requires that *some* meeting record exists for the session (past or
// future) — without one, the {{meeting_time}} / {{meeting_link}} merge
// tokens render empty and the email is meaningless.

interface MatchedRule { id: string; name: string; isActive: boolean }

async function loadContext(sessionId: string, workspaceId: string) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, workspaceId },
    select: { id: true, flowId: true },
  })
  if (!session) return { session: null, hasMeeting: false, rules: [] as MatchedRule[] }

  let hasMeeting = !!(await prisma.interviewMeeting.findFirst({
    where: { sessionId: session.id },
    select: { id: true },
  }))
  if (!hasMeeting) {
    const evt = await prisma.schedulingEvent.findFirst({
      where: { sessionId: session.id, eventType: { in: ['meeting_scheduled', 'meeting_rescheduled'] } },
      select: { id: true },
    })
    if (evt) hasMeeting = true
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

  return { session, hasMeeting, rules }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { session, hasMeeting, rules } = await loadContext(params.id, ws.workspaceId)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ hasMeeting, rules })
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { session, hasMeeting, rules } = await loadContext(params.id, ws.workspaceId)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!hasMeeting) {
    return NextResponse.json({ error: 'No meeting found for this candidate — nothing to remind about.' }, { status: 400 })
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
