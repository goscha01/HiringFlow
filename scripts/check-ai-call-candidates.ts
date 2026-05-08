import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const candidates = await prisma.aICallCandidate.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  console.log(`AICallCandidate rows (latest 20): ${candidates.length}`)
  for (const c of candidates) {
    console.log(`- ${c.name} (id=${c.id.slice(0, 8)}, agentId=${c.agentId.slice(0, 12)}…, ws=${c.workspaceId.slice(0, 8)})`)
    console.log(`    createdAt: ${c.createdAt.toISOString()}`)
    console.log(`    conversationIds: [${c.conversationIds.length}] ${c.conversationIds.join(', ')}`)
  }

  // Show workspaces that have an elevenlabs_agent_id configured
  const workspaces = await prisma.workspace.findMany()
  console.log(`\nWorkspaces with elevenlabs_agent_id:`)
  for (const ws of workspaces) {
    const settings = (ws.settings || {}) as Record<string, string>
    if (settings.elevenlabs_agent_id) {
      console.log(`- ${ws.name || ws.id.slice(0, 8)}: agentId=${settings.elevenlabs_agent_id}`)
    }
  }

  // ElevenLabs conversations
  const platformKey = await prisma.platformSetting.findUnique({ where: { key: 'elevenlabs_api_key' } })
  if (!platformKey?.value) {
    console.log('\nNo elevenlabs_api_key set in PlatformSetting')
    return
  }
  const agentIds = workspaces
    .map(w => ((w.settings || {}) as any).elevenlabs_agent_id)
    .filter(Boolean) as string[]
  for (const agentId of [...new Set(agentIds)]) {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=10`, {
      headers: { 'xi-api-key': platformKey.value },
    })
    if (!r.ok) {
      console.log(`\nElevenLabs API ${r.status} for agent ${agentId}`)
      continue
    }
    const data = await r.json()
    const convs = data.conversations || []
    console.log(`\nElevenLabs conversations for agent ${agentId}: ${convs.length} total`)
    for (const c of convs.slice(0, 5)) {
      const t = new Date((c.start_time_unix_secs || 0) * 1000).toISOString()
      console.log(`- ${c.conversation_id} status=${c.status} success=${c.call_successful} dur=${c.call_duration_secs}s start=${t} msgs=${c.message_count}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
