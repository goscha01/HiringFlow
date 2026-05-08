import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  const rows = await prisma.schedulingConfig.findMany({
    select: { id: true, name: true, useBuiltInScheduler: true, schedulingUrl: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const r of rows) {
    console.log(r.useBuiltInScheduler ? '[built-in]' : '[external] ', r.name, '|', r.schedulingUrl)
  }
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
