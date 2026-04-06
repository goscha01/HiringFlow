import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const workspace = await prisma.workspace.findUnique({ where: { id: ws.workspaceId } })
  if (!workspace) return unauthorized()

  const settings = (workspace.settings || {}) as Record<string, string>
  const apiKey = settings.elevenlabs_api_key
  const agentId = settings.elevenlabs_agent_id

  if (!apiKey || !agentId) {
    return NextResponse.json({ error: 'ElevenLabs API key and Agent ID required. Configure in AI Calls settings.' }, { status: 400 })
  }

  // Fetch conversations from ElevenLabs
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=100`, {
    headers: { 'xi-api-key': apiKey },
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `ElevenLabs API error: ${res.status}`, details: err }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
