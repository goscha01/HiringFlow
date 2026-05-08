import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const c = await p.certnIntegration.findUnique({
    where: { workspaceId: '739bcd71-69fd-4b30-a39e-242521b7ab20' },
  })
  if (!c) { console.log('(no row)'); return }
  console.log({
    id: c.id,
    region: c.region,
    useSandbox: c.useSandbox,
    isActive: c.isActive,
    inviteExpiryDays: c.inviteExpiryDays,
    defaultCheckTypesKeys: c.defaultCheckTypes && typeof c.defaultCheckTypes === 'object' ? Object.keys(c.defaultCheckTypes as object) : 'not-an-object',
    defaultCheckTypes: c.defaultCheckTypes,
    hasApiKey: !!c.apiKeyEncrypted,
    hasWebhookSecret: !!c.webhookSecret,
  })
}
main().catch(console.error).finally(() => p.$disconnect())
