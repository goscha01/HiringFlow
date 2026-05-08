import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const cols = await p.$queryRawUnsafe(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'certn_integrations'
    ORDER BY ordinal_position
  `)
  console.log(JSON.stringify(cols, null, 2))
}
main().catch(console.error).finally(() => p.$disconnect())
