import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
;(async () => {
  // Get all users to see what's there
  const allUsers = await p.user.findMany({ select: { id: true, email: true, name: true } })
  console.log(`All users (${allUsers.length}):`)
  for (const u of allUsers) console.log(`  ${u.id}  ${u.email}  ${u.name}`)
  // The Spotless workspace user is info@spotless.homes (Georgiy Sayapin)
  const user = allUsers.find(u => u.email === 'info@spotless.homes')
  console.log('\nMatched USER', user)
  if (!user) return

  const memberships = await p.workspaceMember.findMany({
    where: { userId: user.id },
    select: { workspaceId: true, role: true, workspace: { select: { name: true } } },
  })
  console.log(`\nWORKSPACE MEMBERSHIPS (${memberships.length}):`)
  for (const m of memberships) console.log(`  ws=${m.workspaceId}  role=${m.role}  name="${m.workspace?.name}"`)

  // List ALL GoogleIntegrations to compare update timestamps
  const integrations = await p.googleIntegration.findMany({
    where: {},
    select: {
      workspaceId: true, googleEmail: true,
      accessExpiresAt: true, lastSyncedAt: true, watchExpiresAt: true,
      recordingCapable: true, recordingCapabilityReason: true, recordingCapabilityCheckedAt: true,
      updatedAt: true, createdAt: true,
    },
  })
  console.log(`\nALL GOOGLE INTEGRATIONS (${integrations.length}), sorted by updatedAt desc:`)
  integrations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  const allWs = await p.workspace.findMany({ select: { id: true, name: true } })
  for (const g of integrations) {
    const ws = allWs.find(w => w.id === g.workspaceId)
    console.log(`\n  ws=${g.workspaceId}  "${ws?.name}"`)
    console.log(`    googleEmail=${g.googleEmail}`)
    console.log(`    accessExpiresAt=${g.accessExpiresAt?.toISOString() ?? 'null'}`)
    console.log(`    lastSyncedAt=${g.lastSyncedAt?.toISOString() ?? 'null'}`)
    console.log(`    watchExpiresAt=${g.watchExpiresAt?.toISOString() ?? 'null'}`)
    console.log(`    recordingCapable=${g.recordingCapable} reason=${g.recordingCapabilityReason} checkedAt=${g.recordingCapabilityCheckedAt?.toISOString() ?? 'null'}`)
    console.log(`    updatedAt=${g.updatedAt.toISOString()}`)
    console.log(`    createdAt=${g.createdAt.toISOString()}`)
  }

  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
