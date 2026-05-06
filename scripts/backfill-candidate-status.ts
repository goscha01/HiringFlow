/**
 * Backfill `Session.status`, `dispositionReason`, and the lifecycle stamps
 * (`stalledAt` / `lostAt` / `hiredAt`) for every existing session.
 *
 * Conservative mapping (one pass, idempotent):
 *
 *   pipelineStatus / outcome / rejectionReason → status, dispositionReason, *At
 *   ─────────────────────────────────────────────────────────────────────────────
 *   pipelineStatus IN ('hired')                  → status='hired',  hiredAt = startedAt
 *   pipelineStatus IN ('rejected','failed')      → status='lost',   lostAt  = rejectionReasonAt ?? startedAt
 *     AND rejectionReason ILIKE '%no-show%'      →   dispositionReason='interview_no_show'
 *     AND rejectionReason ILIKE '%declin%'       →   dispositionReason='candidate_declined'
 *     AND rejectionReason ILIKE '%qualif%'       →   dispositionReason='not_qualified'
 *     AND any other rejectionReason              →   dispositionReason='manual_other'
 *   outcome='failed' AND status not yet set      → status='lost',   dispositionReason='failed_screening'
 *   outcome='abandoned' AND status not yet set   → status='lost',   dispositionReason='manual_other'
 *   everything else                              → status='active'  (Prisma default; we only update if NULL)
 *
 * Stalled is intentionally NOT inferred at backfill time — we'd be guessing
 * about candidates whose lastActivityAt was never populated. The cron will
 * catch genuinely stale ones on its first run.
 *
 * Usage:
 *   npx tsx scripts/backfill-candidate-status.ts            # dry run, prints counts
 *   npx tsx scripts/backfill-candidate-status.ts --apply    # writes
 *
 * Safe to re-run: every UPDATE is gated on the column being NULL or `'active'`
 * (the default), so re-runs do not overwrite manual lifecycle actions taken
 * after the first run.
 */

import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient()

async function main() {
  console.log(`[backfill] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  // Counts before — distinct status NULL because the column was just added
  const total = await prisma.session.count()
  console.log(`[backfill] total sessions: ${total}`)

  // 1) hired
  const hiredFilter = { pipelineStatus: 'hired', status: 'active' as const }
  const hiredCount = await prisma.session.count({ where: hiredFilter })
  console.log(`[backfill] → hired: ${hiredCount}`)
  if (APPLY && hiredCount > 0) {
    // Postgres-side `hiredAt = COALESCE(rejection_reason_at, started_at)` so
    // we don't need to fetch every row into Node first.
    await prisma.$executeRaw`
      UPDATE sessions
         SET status = 'hired',
             hired_at = COALESCE(rejection_reason_at, started_at)
       WHERE pipeline_status = 'hired'
         AND status = 'active'
         AND hired_at IS NULL
    `
  }

  // 2) lost — bucketed by rejection reason text
  const lostBuckets: Array<{ reason: string; like: string }> = [
    { reason: 'interview_no_show', like: '%no-show%' },
    { reason: 'candidate_declined', like: '%declin%' },
    { reason: 'not_qualified', like: '%qualif%' },
  ]
  for (const { reason, like } of lostBuckets) {
    const cnt = await prisma.session.count({
      where: {
        pipelineStatus: { in: ['rejected', 'failed'] },
        status: 'active',
        rejectionReason: { contains: like.replace(/%/g, ''), mode: 'insensitive' },
      },
    })
    console.log(`[backfill] → lost / ${reason}: ${cnt}`)
    if (APPLY && cnt > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE sessions
            SET status = 'lost',
                disposition_reason = $1,
                lost_at = COALESCE(rejection_reason_at, started_at)
          WHERE pipeline_status IN ('rejected','failed')
            AND status = 'active'
            AND lost_at IS NULL
            AND rejection_reason ILIKE $2`,
        reason,
        like,
      )
    }
  }

  // Catch-all for rejected/failed without a recognized reason
  const lostOtherCount = await prisma.session.count({
    where: { pipelineStatus: { in: ['rejected', 'failed'] }, status: 'active' },
  })
  console.log(`[backfill] → lost / manual_other (catch-all rejected/failed): ${lostOtherCount}`)
  if (APPLY && lostOtherCount > 0) {
    await prisma.$executeRaw`
      UPDATE sessions
         SET status = 'lost',
             disposition_reason = COALESCE(disposition_reason, 'manual_other'),
             lost_at = COALESCE(lost_at, rejection_reason_at, started_at)
       WHERE pipeline_status IN ('rejected','failed')
         AND status = 'active'
         AND lost_at IS NULL
    `
  }

  // 3) outcome='failed' / 'abandoned' without an explicit pipelineStatus rejection
  const failedOutcomeCount = await prisma.session.count({
    where: {
      outcome: 'failed',
      status: 'active',
      pipelineStatus: { notIn: ['rejected', 'failed'] },
    },
  })
  console.log(`[backfill] → lost / failed_screening (outcome=failed, no rejected stage): ${failedOutcomeCount}`)
  if (APPLY && failedOutcomeCount > 0) {
    await prisma.$executeRaw`
      UPDATE sessions
         SET status = 'lost',
             disposition_reason = COALESCE(disposition_reason, 'failed_screening'),
             lost_at = COALESCE(lost_at, finished_at, started_at)
       WHERE outcome = 'failed'
         AND status = 'active'
         AND lost_at IS NULL
         AND (pipeline_status IS NULL OR pipeline_status NOT IN ('rejected','failed'))
    `
  }

  // 4) outcome='abandoned' — deliberately NOT auto-marked lost. Abandoned
  // could mean "user closed the tab" mid-flow; the cron will mark it stalled
  // if it actually went quiet, and a recruiter can decide whether to call it
  // lost. Logged as a count only.
  const abandonedCount = await prisma.session.count({
    where: { outcome: 'abandoned', status: 'active' },
  })
  console.log(`[backfill]   (left as 'active') outcome='abandoned': ${abandonedCount}  ← cron will reclassify`)

  // 5) Everything else = active. Default already covers this — just report.
  const activeCount = await prisma.session.count({ where: { status: 'active' } })
  console.log(`[backfill] active after backfill: ${activeCount}`)

  // Sanity: post-counts by status
  const finalCounts = await prisma.session.groupBy({
    by: ['status'],
    _count: { _all: true },
  })
  console.log('[backfill] post-status distribution:')
  for (const row of finalCounts) console.log(`   ${row.status}: ${row._count._all}`)

  await prisma.$disconnect()
  console.log(APPLY ? '[backfill] DONE (applied)' : '[backfill] DONE (dry-run, no writes)')
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
