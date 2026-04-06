import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET — fetch current agent evaluation criteria
export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const workspace = await prisma.workspace.findUnique({ where: { id: ws.workspaceId } })
  const agentId = (workspace?.settings as any)?.elevenlabs_agent_id
  if (!agentId) return NextResponse.json({ error: 'No agent configured' }, { status: 400 })

  const platformKey = await prisma.platformSetting.findUnique({ where: { key: 'elevenlabs_api_key' } })
  if (!platformKey?.value) return NextResponse.json({ error: 'API key not configured' }, { status: 400 })

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': platformKey.value },
  })
  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch agent' }, { status: res.status })

  const agent = await res.json()
  const criteria = agent.platform_settings?.evaluation?.criteria || []
  const firstCriteria = criteria[0] || {}

  return NextResponse.json({
    agentId,
    agentName: agent.name,
    criteriaId: firstCriteria.id || 'call_evaluation',
    criteriaName: firstCriteria.name || 'Call evaluation',
    prompt: firstCriteria.conversation_goal_prompt || '',
  })
}

// PATCH — update the evaluation criteria prompt on ElevenLabs
export async function PATCH(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const workspace = await prisma.workspace.findUnique({ where: { id: ws.workspaceId } })
  const agentId = (workspace?.settings as any)?.elevenlabs_agent_id
  if (!agentId) return NextResponse.json({ error: 'No agent configured' }, { status: 400 })

  const platformKey = await prisma.platformSetting.findUnique({ where: { key: 'elevenlabs_api_key' } })
  if (!platformKey?.value) return NextResponse.json({ error: 'API key not configured' }, { status: 400 })

  const { criteriaId, criteriaName, prompt } = await request.json()

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': platformKey.value,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      platform_settings: {
        evaluation: {
          criteria: [{
            id: criteriaId || 'call_evaluation',
            name: criteriaName || 'Call evaluation',
            type: 'prompt',
            conversation_goal_prompt: prompt,
          }],
        },
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `Failed to update: ${res.status}`, details: err }, { status: res.status })
  }

  return NextResponse.json({ success: true })
}
