import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const agentId = params.slug

  const platformKey = await prisma.platformSetting.findUnique({ where: { key: 'elevenlabs_api_key' } })
  if (!platformKey?.value) {
    return NextResponse.json({ error: 'Not configured' }, { status: 400 })
  }

  // Fetch recent conversations for this agent
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=5`, {
    headers: { 'xi-api-key': platformKey.value },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: res.status })
  }

  const data = await res.json()
  const conversations = data.conversations || []

  // Find the most recent conversation that is done
  const latest = conversations.find((c: any) => c.status === 'done')

  if (!latest) {
    return NextResponse.json({ error: 'No completed conversations found', processing: true }, { status: 404 })
  }

  // Fetch full detail
  const detailRes = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${latest.conversation_id}`, {
    headers: { 'xi-api-key': platformKey.value },
  })

  if (!detailRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch detail' }, { status: detailRes.status })
  }

  const detail = await detailRes.json()

  // Return the same shape as the admin conversations detail
  return NextResponse.json({
    conversation_id: detail.conversation_id,
    status: detail.status,
    call_duration_secs: detail.call_duration_secs,
    transcript: detail.transcript || [],
    analysis: detail.analysis || null,
  })
}
