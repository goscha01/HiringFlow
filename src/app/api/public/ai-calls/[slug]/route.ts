import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET — fetch the latest conversation evaluation for this agent
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const agentId = params.slug

  // Get platform API key
  const platformKey = await prisma.platformSetting.findUnique({ where: { key: 'elevenlabs_api_key' } })
  if (!platformKey?.value) {
    return NextResponse.json({ error: 'Not configured' }, { status: 400 })
  }

  // Fetch latest conversations for this agent
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=1`, {
    headers: { 'xi-api-key': platformKey.value },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: res.status })
  }

  const data = await res.json()
  const latest = data.conversations?.[0]

  if (!latest) {
    return NextResponse.json({ error: 'No conversations found' }, { status: 404 })
  }

  // Fetch full detail with evaluation
  const detailRes = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${latest.conversation_id}`, {
    headers: { 'xi-api-key': platformKey.value },
  })

  if (!detailRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch detail' }, { status: detailRes.status })
  }

  const detail = await detailRes.json()

  return NextResponse.json({
    conversation_id: detail.conversation_id,
    status: detail.status,
    duration: detail.call_duration_secs,
    analysis: detail.analysis || null,
  })
}
