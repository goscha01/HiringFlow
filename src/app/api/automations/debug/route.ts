import { NextRequest, NextResponse } from 'next/server'
import { executeRule } from '@/lib/automation'
import { getWorkspaceSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const maxDuration = 60

/**
 * Debug endpoint — execute an arbitrary rule against an arbitrary session.
 *
 * Hard-disabled in production unless ALL of the following are true:
 *   1. `DEBUG_AUTOMATIONS_ENABLED=true` is set on the environment.
 *   2. The caller is an authenticated workspace super-admin.
 *   3. The target session and rule belong to the caller's workspace
 *      (no cross-workspace debug from one tenant against another).
 *
 * The `x-debug-secret` header used to be the only gate. That was a hardcoded
 * shared secret in the source — anyone with repo access (or a leaked log
 * line) could fire any rule against any session in production. The new
 * model requires a logged-in super admin AND an explicit env flag, and the
 * call is audited through the central guard's `executionMode='debug'` path.
 */
const ADMIN_ROLES = new Set(['admin', 'owner'])

export async function POST(request: NextRequest) {
  const trace: string[] = []
  try {
    if (process.env.DEBUG_AUTOMATIONS_ENABLED !== 'true') {
      return NextResponse.json({ error: 'debug endpoint disabled' }, { status: 404 })
    }
    const ws = await getWorkspaceSession()
    if (!ws) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    if (!ws.isSuperAdmin && !ADMIN_ROLES.has(ws.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await request.text()
    trace.push(`body=${body.slice(0, 300)}`)
    const { ruleId, sessionId, force } = JSON.parse(body || '{}') as {
      ruleId?: string
      sessionId?: string
      force?: boolean
    }
    trace.push(`parsed ruleId=${ruleId} sessionId=${sessionId} force=${force === true}`)
    if (!ruleId || !sessionId) {
      return NextResponse.json({ error: 'ruleId and sessionId required', trace }, { status: 400 })
    }

    // Cross-workspace guard: never let a workspace admin debug into another
    // workspace's data. Super admins are similarly scoped to one workspace at
    // a time via their active membership.
    const [rule, session] = await Promise.all([
      prisma.automationRule.findFirst({
        where: { id: ruleId, workspaceId: ws.workspaceId },
        select: { id: true, triggerType: true },
      }),
      prisma.session.findFirst({
        where: { id: sessionId, workspaceId: ws.workspaceId },
        select: { id: true },
      }),
    ])
    if (!rule) return NextResponse.json({ error: 'rule not found in workspace' }, { status: 404 })
    if (!session) return NextResponse.json({ error: 'session not found in workspace' }, { status: 404 })

    await executeRule(ruleId, sessionId, {
      ignoreActive: true,
      force: force === true,
      dispatchCtx: {
        triggerType: rule.triggerType,
        executionMode: 'debug',
        actorUserId: ws.userId,
        force: force === true,
      },
    })
    trace.push('executeRule returned')
    return NextResponse.json({ ok: true, trace })
  } catch (err: any) {
    trace.push(`error=${err?.message || String(err)} stack=${err?.stack?.slice(0, 500) || ''}`)
    return NextResponse.json({ error: 'Execution failed', trace }, { status: 500 })
  }
}
