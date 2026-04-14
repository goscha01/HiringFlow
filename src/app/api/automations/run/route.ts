import { NextRequest, NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { executeRule } from '@/lib/automation'

export const maxDuration = 60

async function handler(request: NextRequest) {
  const trace: string[] = []
  try {
    const body = await request.text()
    trace.push(`body=${body.slice(0, 300)}`)
    const { ruleId, sessionId } = JSON.parse(body || '{}')
    trace.push(`parsed ruleId=${ruleId} sessionId=${sessionId}`)
    if (!ruleId || !sessionId) {
      return NextResponse.json({ error: 'ruleId and sessionId required', trace }, { status: 400 })
    }
    await executeRule(ruleId, sessionId)
    trace.push('executeRule returned')
    return NextResponse.json({ ok: true, trace })
  } catch (err: any) {
    console.error('[Automation /run] Error:', err)
    trace.push(`error=${err?.message || String(err)}`)
    return NextResponse.json({ error: 'Execution failed', trace }, { status: 500 })
  }
}

// In production, verify QStash signature. In local/dev without keys, accept unsigned
// requests so `curl` testing works. Never leave unsigned handler enabled in prod.
export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler
