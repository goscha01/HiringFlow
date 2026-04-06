import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const platformKey = await prisma.platformSetting.findUnique({ where: { key: 'elevenlabs_api_key' } })
  if (!platformKey?.value) {
    return NextResponse.json({ error: 'ElevenLabs not configured by platform admin' }, { status: 400 })
  }

  const res = await fetch('https://api.elevenlabs.io/v1/convai/agents?page_size=100', {
    headers: { 'xi-api-key': platformKey.value },
  })

  if (!res.ok) {
    return NextResponse.json({ error: `ElevenLabs API error: ${res.status}` }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data.agents || [])
}
