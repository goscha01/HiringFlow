import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeRule } from '@/lib/automation'
import { normalizeStages, type StageTriggerEvent } from '@/lib/funnel-stages'

// Manually fire all automations attached (via funnel-stage triggers) to a
// given stage, for one candidate. Each stage has zero or more StageTriggers
// (event + optional targetId). For every trigger event we find active
// AutomationRules that share the same triggerType and either match the
// candidate's flowId or have no flow filter, then run them immediately —
// delays are intentionally ignored: the recruiter is asking for it to fire
// *now* for *this* candidate.
//
// GET returns the same matched-rule list without firing, so the UI can show
// a count / button-enabled state.

interface MatchedRule {
  id: string
  name: string
  triggerType: string
  isActive: boolean
}

async function findMatchingRules(opts: {
  workspaceId: string
  stageId: string
  flowId: string
}): Promise<{ stageExists: boolean; events: StageTriggerEvent[]; rules: MatchedRule[] }> {
  const ws = await prisma.workspace.findUnique({
    where: { id: opts.workspaceId },
    select: { settings: true },
  })
  const stages = normalizeStages((ws?.settings as { funnelStages?: unknown } | null)?.funnelStages)
  const stage = stages.find((s) => s.id === opts.stageId)
  if (!stage) return { stageExists: false, events: [], rules: [] }

  const events = Array.from(new Set((stage.triggers ?? []).map((t) => t.event)))

  // A rule matches this stage when EITHER:
  //  - it's explicitly pinned (stageId === opts.stageId), OR
  //  - stageId is null AND its triggerType is one of the stage's events.
  // Explicit pins win even if the stage has no triggers configured, so a
  // recruiter can attach an automation manually without first having to
  // hook the trigger into the stage.
  const stageMatch = [
    { stageId: opts.stageId },
    ...(events.length > 0 ? [{ stageId: null, triggerType: { in: events } }] : []),
  ]

  const rules = await prisma.automationRule.findMany({
    where: {
      workspaceId: opts.workspaceId,
      isActive: true,
      AND: [
        { OR: stageMatch },
        { OR: [{ flowId: opts.flowId }, { flowId: null }] },
      ],
    },
    select: { id: true, name: true, triggerType: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  return { stageExists: true, events, rules }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const stageId = request.nextUrl.searchParams.get('stageId')
  if (!stageId) return NextResponse.json({ error: 'stageId is required' }, { status: 400 })

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: { id: true, flowId: true },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { stageExists, events, rules } = await findMatchingRules({
    workspaceId: ws.workspaceId,
    stageId,
    flowId: session.flowId,
  })
  if (!stageExists) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  return NextResponse.json({ events, rules })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { stageId } = await request.json().catch(() => ({})) as { stageId?: string }
  if (!stageId || typeof stageId !== 'string') {
    return NextResponse.json({ error: 'stageId is required' }, { status: 400 })
  }

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: { id: true, flowId: true },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { stageExists, rules } = await findMatchingRules({
    workspaceId: ws.workspaceId,
    stageId,
    flowId: session.flowId,
  })
  if (!stageExists) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  if (rules.length === 0) return NextResponse.json({ fired: 0, results: [] })

  const results: Array<{ ruleId: string; name: string; ok: boolean; error?: string }> = []
  for (const rule of rules) {
    try {
      // Manual run = recruiter intent to send now. Bypass the per-step
      // "already sent" guard so a re-trigger actually re-sends instead of
      // silently no-opping when the rule already fired automatically.
      await executeRule(rule.id, session.id, { ignoreSentGuard: true })
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

  const fired = results.filter((r) => r.ok).length
  return NextResponse.json({ fired, results })
}
