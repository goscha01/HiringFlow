import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
;(async () => {
  const gi = await p.googleIntegration.findUnique({
    where: { workspaceId: '739bcd71-69fd-4b30-a39e-242521b7ab20' },
    select: {
      googleEmail: true, calendarId: true, watchExpiresAt: true, watchChannelId: true, watchResourceId: true,
      lastSyncedAt: true, accessExpiresAt: true, syncToken: true,
      recordingCapable: true, recordingCapabilityReason: true, recordingCapabilityCheckedAt: true,
      transcriptionCapable: true, transcriptionCapabilityReason: true, transcriptionCapabilityCheckedAt: true,
      grantedScopes: true, hostedDomain: true, updatedAt: true, createdAt: true,
    },
  })
  console.log(JSON.stringify(gi, (_k, v) => (v instanceof Date ? v.toISOString() : v), 2))
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
