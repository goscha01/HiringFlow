import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const agentId = params.slug

  const platformKey = await prisma.platformSetting.findUnique({ where: { key: 'elevenlabs_api_key' } })
  if (!platformKey?.value) {
    return NextResponse.json({ error: 'Not configured' }, { status: 400 })
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': platformKey.value },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: res.status })
  }

  const agent = await res.json()

  // Extract evaluation criteria from platform_settings.evaluation.criteria
  const criteria = agent.platform_settings?.evaluation?.criteria || []

  return NextResponse.json({
    name: agent.name,
    criteria: criteria.map((c: any) => ({
      id: c.id,
      name: c.name,
      prompt: c.conversation_goal_prompt || '',
    })),
  })
}
