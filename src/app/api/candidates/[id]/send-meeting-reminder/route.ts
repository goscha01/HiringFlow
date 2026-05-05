import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeRule } from '@/lib/automation'

// Manually fire the candidate's meeting-related reminder/follow-up rules
// right now, ignoring their scheduled fire time. Two trigger types are
// included so a single button covers both phases:
//   - before_meeting   → "your interview is at X" reminder
//   - meeting_no_show  → "you missed it, want to rebook?" follow-up
// In practice a workspace only has the relevant kind active for a given
// candidate state, so firing both doesn't double up.
//
// GET returns the matched rules (so the UI can show a count); POST fires them.
// Requires that *some* meeting record exists for the session (past or
// future) — without one, the {{meeting_time}} / {{meeting_link}} merge
// tokens render empty and the email is meaningless.

const MANUAL_TRIGGERS = ['before_meeting', 'meeting_no_show'] as const

interface MatchedRule { id: string; name: string; triggerType: string; isActive: boolean }

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
      triggerType: { in: [...MANUAL_TRIGGERS] },
      isActive: true,
      OR: [{ flowId: session.flowId }, { flowId: null }],
    },
    select: { id: true, name: true, triggerType: true, isActive: true },
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
    return NextResponse.json({ error: 'No active before-meeting or no-show follow-up rules configured for this flow.' }, { status: 400 })
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
