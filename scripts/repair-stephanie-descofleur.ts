/**
 * One-off: Stephanie Descofleur was stuck at pipelineStatus='invited_to_schedule'
 * after completing her test-job training because the onboarding-training
 * "send scheduling link" rule was firing for ALL training_completed events
 * (dispatcher dropped trainingId — fixed in this commit). The scheduling
 * step's "regress to invited_to_schedule" hit her after she'd already
 * advanced past stage_8 (Meeting).
 *
 * Sets her to stage_8_2 (Background check) — the natural next funnel
 * column for a Spotless candidate who finished test-job training.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const SESSION_ID = '8f8732ba-75e4-4153-9ee3-06fdaf8ec094'
const TARGET = 'stage_8_2' // Background check
const APPLY = process.argv.includes('--apply')

async function main() {
  const before = await prisma.session.findUnique({
    where: { id: SESSION_ID },
    select: { candidateName: true, pipelineStatus: true, workspaceId: true },
  })
  if (!before) { console.log('session not found'); return }
  console.log(`candidate       : ${before.candidateName}`)
  console.log(`workspace       : ${before.workspaceId}`)
  console.log(`pipelineStatus  : ${before.pipelineStatus}  →  ${TARGET}`)
  if (!APPLY) { console.log('\n(dry-run — pass --apply to write)'); return }
  await prisma.session.update({
    where: { id: SESSION_ID },
    data: { pipelineStatus: TARGET },
  })
  const after = await prisma.session.findUnique({
    where: { id: SESSION_ID },
    select: { pipelineStatus: true },
  })
  console.log(`written         : ${after?.pipelineStatus}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
