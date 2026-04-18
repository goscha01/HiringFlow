/**
 * Backfill Video.kind. Videos referenced by a FlowStep are interview-type;
 * everything else stays at the schema default ('training'). Idempotent.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const interviewVideoIds = await prisma.flowStep.findMany({
    where: { videoId: { not: null } },
    select: { videoId: true },
    distinct: ['videoId'],
  })
  const ids = interviewVideoIds.map((r) => r.videoId!).filter(Boolean)

  const { count } = await prisma.video.updateMany({
    where: { id: { in: ids } },
    data: { kind: 'interview' },
  })

  console.log(`[migrate-video-kind] tagged interview=${count}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
