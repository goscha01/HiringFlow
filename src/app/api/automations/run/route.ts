import { NextRequest, NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { executeRule, executeStep } from '@/lib/automation'

export const maxDuration = 60

async function handler(request: NextRequest) {
  const trace: string[] = []
  try {
    const body = await request.text()
    trace.push(`body=${body.slice(0, 300)}`)
    const payload = JSON.parse(body || '{}')
    trace.push(`parsed payload=${JSON.stringify(payload)}`)

    // New step-shaped messages: { stepId, sessionId, channel }
    if (payload.stepId && payload.sessionId) {
      const channel = payload.channel === 'sms' ? 'sms' : 'email'
      await executeStep(payload.stepId, payload.sessionId, channel)
      trace.push('executeStep returned')
      return NextResponse.json({ ok: true, trace })
    }

    // Legacy rule-shaped messages still in flight: { ruleId, sessionId }.
    // We fan out to every step and every channel under the rule. This is a
    // best-effort safety net; new dispatches always use the step shape.
    if (payload.ruleId && payload.sessionId) {
      await executeRule(payload.ruleId, payload.sessionId)
      trace.push('executeRule (legacy shape) returned')
      return NextResponse.json({ ok: true, trace })
    }

    return NextResponse.json({ error: 'missing stepId/sessionId or ruleId/sessionId', trace }, { status: 400 })
  } catch (err: any) {
    console.error('[Automation /run] Error:', err)
    trace.push(`error=${err?.message || String(err)}`)
    return NextResponse.json({ error: 'Execution failed', trace }, { status: 500 })
  }
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler
