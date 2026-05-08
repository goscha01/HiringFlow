import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  // Get API key from platform settings
  const platformKey = await prisma.platformSetting.findUnique({ where: { key: 'elevenlabs_api_key' } })
  if (!platformKey?.value) {
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 400 })
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${params.id}`, {
    headers: { 'xi-api-key': platformKey.value },
  })

  if (!res.ok) {
    return NextResponse.json({ error: `ElevenLabs API error: ${res.status}` }, { status: res.status })
  }

  const data = await res.json()
  // ElevenLabs detail nests call_duration_secs under metadata; lift it for clients
  // that read it at the top level.
  return NextResponse.json({
    ...data,
    call_duration_secs: data.metadata?.call_duration_secs ?? data.call_duration_secs ?? 0,
  })
}
