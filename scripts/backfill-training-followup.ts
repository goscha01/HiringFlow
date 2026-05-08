/**
 * Catch-up: send step 1 (the 3-day follow-up email) of the
 * "Training email after completing form" rule to Spotless candidates
 * still sitting in the Application stage who never received it.
 *
 * Why needed: the follow-up step was added on 5/5 ~14:00 UTC. Candidates
 * who completed the form before that triggered the rule when it had
 * only step 0 — there is no retroactive backfill in the chained
 * automation_completed dispatch path, so step 1 was never queued for them.
 *
 * executeStep is idempotent: rows already marked status='sent' are
 * skipped. So this safely no-ops on any candidate who somehow already
 * received the follow-up. Rows in 'queued' status get overwritten by
 * the sync send (the eventual QStash callback will then no-op too).
 *
 * Usage:
 *   dry-run : npx tsx -r dotenv/config scripts/backfill-training-followup.ts dotenv_config_path=.env.diagnose
 *   apply   : npx tsx -r dotenv/config scripts/backfill-training-followup.ts --apply dotenv_config_path=.env.diagnose
 */
import { PrismaClient } from '@prisma/client'
import { executeStep } from '../src/lib/automation'

const prisma = new PrismaClient()
const WS = '739bcd71-69fd-4b30-a39e-242521b7ab20'
const RULE_ID = '8e934aa7-f432-4955-b453-76886534b54f'
const APPLY = process.argv.includes('--apply')

// pipelineStatus values that render in the Application kanban column
// (in_progress is the configured stage id; the rest are legacy values
// that map to in_progress via funnel-stages.ts LEGACY_STATUS_MAP).
const APPLICATION_STATUSES = ['in_progress', 'completed_flow', 'invited_to_schedule', 'applied', 'passed']

// Minimum days since startedAt to be eligible for the catch-up. Below
// this, let the natural QStash queue (or the absence of one) play out.
// Picked 3 to align with the rule's configured 3-day delay — anyone
// fresher hasn't earned a "still haven't started?" nudge yet.
const MIN_DAYS = 3

async function main() {
  const rule = await prisma.automationRule.findUnique({
    where: { id: RULE_ID },
    include: { steps: { orderBy: { order: 'asc' } } },
  })
  if (!rule) { console.log('rule not found'); return }
  const step1 = rule.steps[1]
  if (!step1) { console.log('rule has no step 1 — nothing to send'); return }
  console.log(`Rule  : ${rule.name}`)
  console.log(`Step 1: id=${step1.id} channel=${step1.channel} delay=${step1.delayMinutes}m`)
  console.log(`Mode  : ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

  const apps = await prisma.session.findMany({
    where: {
      workspaceId: WS,
      pipelineStatus: { in: APPLICATION_STATUSES },
      // Skip obvious test rows
      NOT: { candidateName: { startsWith: 'Test:' } },
    },
    select: { id: true, candidateName: true, candidateEmail: true, startedAt: true },
    orderBy: { startedAt: 'asc' },
  })

  let sent = 0, skipSent = 0, skipQueued = 0, skipNoStep0 = 0, skipTooFresh = 0, skipNewerSession = 0, errors = 0
  for (const s of apps) {
    const days = (Date.now() - s.startedAt.getTime()) / 86400000
    // Too fresh: send the natural follow-up at the configured 3-day mark.
    if (days < MIN_DAYS) { skipTooFresh++; continue }

    // If the same candidate has a newer session past the Application
    // stage (e.g. a re-submission that's already in stage_7), skip — the
    // candidate isn't actually stuck, just had a duplicate. Match on
    // candidateEmail (the only stable id we have across sessions).
    if (s.candidateEmail) {
      const newerActive = await prisma.session.findFirst({
        where: {
          workspaceId: WS,
          candidateEmail: s.candidateEmail,
          startedAt: { gt: s.startedAt },
          pipelineStatus: { notIn: [...APPLICATION_STATUSES, 'rejected', 'failed'] },
        },
        select: { id: true, pipelineStatus: true, startedAt: true },
      })
      if (newerActive) { skipNewerSession++; console.log(`  skip "${s.candidateName}" — newer session ${newerActive.id} at ${newerActive.pipelineStatus}`); continue }
    }

    // Was step 0 actually sent? If not, the candidate never went through
    // this rule at all — bail (we don't want to re-fire from scratch).
    const step0Exec = await prisma.automationExecution.findUnique({
      where: { stepId_sessionId_channel: { stepId: rule.steps[0].id, sessionId: s.id, channel: 'email' } },
    })
    if (!step0Exec || step0Exec.status !== 'sent') { skipNoStep0++; continue }

    // Skip if step 1 already sent OR already queued. Queued rows will
    // deliver naturally in ~3 days — sending now to a candidate who
    // completed the form yesterday is premature for a "haven't started
    // training?" nudge. The catch-up only targets candidates whose step
    // 1 was never even queued (i.e. they completed before the step was
    // added to the rule).
    const step1Exec = await prisma.automationExecution.findUnique({
      where: { stepId_sessionId_channel: { stepId: step1.id, sessionId: s.id, channel: 'email' } },
    })
    if (step1Exec && step1Exec.status === 'sent') { skipSent++; continue }
    if (step1Exec && step1Exec.status === 'queued') { skipQueued++; continue }

    console.log(`  ${days.toFixed(1)}d  ${(s.candidateName ?? '—').padEnd(28)} ${(s.candidateEmail ?? '—').padEnd(36)}  step1Status=${step1Exec?.status ?? '(none)'}`)

    if (APPLY) {
      try {
        await executeStep(step1.id, s.id, 'email')
        sent++
      } catch (e) {
        errors++
        console.error(`    !! error: ${(e as Error).message}`)
      }
    } else {
      sent++ // counted as "would send" in dry-run
    }
  }

  console.log(`\nSummary:`)
  console.log(`  ${APPLY ? 'sent' : 'would send'}: ${sent}`)
  console.log(`  skipped (step1 already sent): ${skipSent}`)
  console.log(`  skipped (step1 already queued — will fire on natural 3d delay): ${skipQueued}`)
  console.log(`  skipped (less than ${MIN_DAYS} days since application): ${skipTooFresh}`)
  console.log(`  skipped (newer session for same email past Application stage): ${skipNewerSession}`)
  console.log(`  skipped (step0 never sent — not in this rule's funnel): ${skipNoStep0}`)
  if (APPLY) console.log(`  errors: ${errors}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
