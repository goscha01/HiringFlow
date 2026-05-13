/**
 * Backfill: assign every AutomationRule with pipelineId IS NULL to its
 * workspace's default Pipeline.
 *
 * Pre-multi-pipeline rules were created with pipelineId=null, which the
 * dispatcher treats as "any-pipeline" (back-compat: rule fires for every
 * candidate regardless of pipeline). After the multi-pipeline refactor, the
 * recruiter-friendlier default is "rules belong to the default pipeline" —
 * that way a Dispatcher rule pinned to Dispatcher doesn't co-fire with
 * legacy any-pipeline rules.
 *
 * Workspaces without a Pipeline row yet get one created on the fly from
 * their legacy Workspace.settings.funnelStages (same lazy migration the
 * runtime resolver uses).
 *
 * Usage:
 *   npx tsx scripts/backfill-automation-pipelines.ts            # dry run, prints counts
 *   npx tsx scripts/backfill-automation-pipelines.ts --apply    # writes
 *
 * Safe to re-run: only updates rules where pipelineId IS NULL, so a re-run
 * never overwrites an explicit assignment made via the UI between runs.
 */

import { PrismaClient } from '@prisma/client'
import { getOrCreateDefaultPipeline } from '../src/lib/pipelines'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient()

async function main() {
  console.log(`[backfill-automation-pipelines] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true },
  })

  let totalAssigned = 0
  let totalAlreadyScoped = 0
  for (const ws of workspaces) {
    const nullCount = await prisma.automationRule.count({
      where: { workspaceId: ws.id, pipelineId: null },
    })
    const scopedCount = await prisma.automationRule.count({
      where: { workspaceId: ws.id, pipelineId: { not: null } },
    })
    totalAlreadyScoped += scopedCount
    if (nullCount === 0) {
      console.log(`  - ${ws.name}: no rules to backfill (already-scoped=${scopedCount})`)
      continue
    }
    const defaultPipeline = await getOrCreateDefaultPipeline(ws.id)
    console.log(`  - ${ws.name}: ${nullCount} any-pipeline rules → "${defaultPipeline.name}" (already-scoped=${scopedCount})`)
    if (APPLY) {
      const result = await prisma.automationRule.updateMany({
        where: { workspaceId: ws.id, pipelineId: null },
        data: { pipelineId: defaultPipeline.id },
      })
      totalAssigned += result.count
    } else {
      totalAssigned += nullCount
    }
  }

  console.log()
  console.log(`[backfill-automation-pipelines] ${APPLY ? 'assigned' : 'would assign'} ${totalAssigned} rules (already-scoped untouched: ${totalAlreadyScoped})`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
