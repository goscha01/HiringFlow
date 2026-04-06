import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET — fetch all conversations for this agent (same data as admin)
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const agentId = params.slug
  const convId = request.nextUrl.searchParams.get('id')

  const platformKey = await prisma.platformSetting.findUnique({ where: { key: 'elevenlabs_api_key' } })
  if (!platformKey?.value) {
    return NextResponse.json({ error: 'Not configured' }, { status: 400 })
  }

  // Single conversation detail
  if (convId) {
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${convId}`, {
      headers: { 'xi-api-key': platformKey.value },
    })
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch' }, { status: res.status })
    return NextResponse.json(await res.json())
  }

  // List all conversations for this agent
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=100`, {
    headers: { 'xi-api-key': platformKey.value },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: res.status })
  }

  return NextResponse.json(await res.json())
}
