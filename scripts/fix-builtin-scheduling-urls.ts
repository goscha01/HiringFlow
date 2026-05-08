/**
 * One-shot migration: clear the placeholder "in-app" string from
 * SchedulingConfig.schedulingUrl on built-in configs. The placeholder
 * was only ever meant to satisfy the NOT NULL String column; with the
 * UI fix it's no longer rendered, but stale rows still have it.
 */

import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  const result = await prisma.schedulingConfig.updateMany({
    where: { useBuiltInScheduler: true, schedulingUrl: 'in-app' },
    data: { schedulingUrl: '', provider: 'built_in' },
  })
  console.log(`Cleared placeholder URL on ${result.count} built-in configs`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
