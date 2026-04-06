import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST — candidate reports a conversation ID to link to their name
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const { candidateName, conversationId } = await request.json()

  if (!candidateName || !conversationId) {
    return NextResponse.json({ error: 'candidateName and conversationId required' }, { status: 400 })
  }

  // Find candidate by name + agentId
  const candidate = await prisma.aICallCandidate.findFirst({
    where: { name: candidateName, agentId: params.slug },
    orderBy: { createdAt: 'desc' },
  })

  if (candidate && !candidate.conversationIds.includes(conversationId)) {
    await prisma.aICallCandidate.update({
      where: { id: candidate.id },
      data: { conversationIds: [...candidate.conversationIds, conversationId] },
    })
  }

  return NextResponse.json({ success: true })
}

// GET — get conversations for a specific candidate name
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const name = request.nextUrl.searchParams.get('name')

  const platformKey = await prisma.platformSetting.findUnique({ where: { key: 'elevenlabs_api_key' } })
  if (!platformKey?.value) return NextResponse.json({ error: 'Not configured' }, { status: 400 })

  // If name provided, find candidate and fetch only their conversations
  if (name) {
    const candidate = await prisma.aICallCandidate.findFirst({
      where: { name, agentId: params.slug },
      orderBy: { createdAt: 'desc' },
    })

    if (candidate && candidate.conversationIds.length > 0) {
      // Fetch detail for each conversation and normalize to list format
      const convDetails = await Promise.all(
        candidate.conversationIds.map(async (cid) => {
          const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${cid}`, {
            headers: { 'xi-api-key': platformKey.value },
          })
          if (!r.ok) return null
          const d = await r.json()
          return {
            conversation_id: d.conversation_id,
            status: d.status,
            start_time_unix_secs: d.metadata?.start_time_unix_secs || Math.floor(new Date(d.metadata?.created_at || 0).getTime() / 1000),
            call_duration_secs: d.call_duration_secs || 0,
            message_count: d.transcript?.length || 0,
            call_successful: d.analysis?.call_successful || null,
            transcript_summary: d.analysis?.transcript_summary || null,
          }
        })
      )
      return NextResponse.json({ conversations: convDetails.filter(Boolean) })
    }

    return NextResponse.json({ conversations: [] })
  }

  // No name — return all conversations (for backward compat)
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${params.slug}&page_size=100`, {
    headers: { 'xi-api-key': platformKey.value },
  })
  if (!res.ok) return NextResponse.json({ error: 'Failed' }, { status: res.status })
  return NextResponse.json(await res.json())
}
