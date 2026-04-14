import { NextRequest, NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { executeRule } from '@/lib/automation'

export const maxDuration = 60

async function handler(request: NextRequest) {
  try {
    const { ruleId, sessionId } = await request.json()
    if (!ruleId || !sessionId) {
      return NextResponse.json({ error: 'ruleId and sessionId required' }, { status: 400 })
    }
    await executeRule(ruleId, sessionId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Automation /run] Error:', err)
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 })
  }
}

// In production, verify QStash signature. In local/dev without keys, accept unsigned
// requests so `curl` testing works. Never leave unsigned handler enabled in prod.
export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler
