import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const workspace = await prisma.workspace.findUnique({ where: { id: ws.workspaceId } })
  if (!workspace) return unauthorized()

  const settings = (workspace.settings || {}) as Record<string, string>
  const apiKey = settings.elevenlabs_api_key

  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs API key required' }, { status: 400 })
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${params.id}`, {
    headers: { 'xi-api-key': apiKey },
  })

  if (!res.ok) {
    return NextResponse.json({ error: `ElevenLabs API error: ${res.status}` }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
