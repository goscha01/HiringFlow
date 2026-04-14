import { NextRequest, NextResponse } from 'next/server'
import { executeRule } from '@/lib/automation'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const trace: string[] = []
  try {
    const secret = request.headers.get('x-debug-secret')
    if (secret !== 'eb36152c-debug') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
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
    trace.push(`error=${err?.message || String(err)} stack=${err?.stack?.slice(0, 500) || ''}`)
    return NextResponse.json({ error: 'Execution failed', trace }, { status: 500 })
  }
}
