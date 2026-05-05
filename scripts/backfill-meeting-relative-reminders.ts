/**
 * One-shot backfill for the "before_meeting timing not applied" bug.
 *
 * Background: until commit 909d0c1, processCalendarEvent fired the
 * meeting_scheduled automations BEFORE adoptExternalMeet had created the
 * InterviewMeeting row. Steps with timingMode='before_meeting' /
 * 'after_meeting' couldn't find a meeting and silently fell back to trigger
 * semantics ("send delayMinutes from now"). For existing candidates with
 * upcoming meetings, those wrong-time executions are still queued in QStash.
 *
 * What this does:
 *   - Find every active rule that has at least one step with
 *     timingMode='before_meeting' or 'after_meeting'.
 *   - Call autoBackfillRuleForUpcomingMeetings on each. That function:
 *       1) Cancels pending QStash jobs for this rule across all sessions.
 *       2) Re-dispatches against every InterviewMeeting where
 *          scheduledStart > now. The InterviewMeeting now exists for these
 *          sessions, so dispatchStep computes timing correctly.
 *
 * Idempotent: dispatchStep upserts the AutomationExecution row by
 * (stepId, sessionId, channel) and skips already-sent ones.
 *
 * Past meetings are not touched (autoBackfillRuleForUpcomingMeetings filters
 * scheduledStart > now). Already-sent wrong-time messages stay sent — there's
 * nothing to do about those.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/backfill-meeting-relative-reminders.ts dotenv_config_path=.env.production
 *   npx tsx -r dotenv/config scripts/backfill-meeting-relative-reminders.ts --apply dotenv_config_path=.env.production
 *
 * Without --apply: dry run, prints what would be backfilled.
 */

import { PrismaClient } from '@prisma/client'
import { autoBackfillRuleForUpcomingMeetings } from '../src/lib/automation'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient()

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required')
  if (APPLY && !process.env.QSTASH_TOKEN) {
    throw new Error('QSTASH_TOKEN required in --apply mode (used to cancel old jobs and queue new ones)')
  }

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`)
  console.log('Looking for rules with meeting-relative steps…\n')

  const rules = await prisma.automationRule.findMany({
    where: {
      isActive: true,
      triggerType: { in: ['meeting_scheduled', 'before_meeting'] },
      steps: { some: { timingMode: { in: ['before_meeting', 'after_meeting'] } } },
    },
    select: {
      id: true, name: true, workspaceId: true, triggerType: true, flowId: true,
      steps: {
        where: { timingMode: { in: ['before_meeting', 'after_meeting'] } },
        select: { id: true, order: true, timingMode: true, delayMinutes: true, channel: true },
        orderBy: { order: 'asc' },
      },
    },
  })

  if (rules.length === 0) {
    console.log('No active rules with meeting-relative steps. Nothing to do.')
    return
  }

  for (const rule of rules) {
    console.log(`▶ Rule: ${rule.name} (${rule.id})`)
    console.log(`  workspace=${rule.workspaceId} trigger=${rule.triggerType} flow=${rule.flowId ?? 'any'}`)
    for (const s of rule.steps) {
      console.log(`  - step[${s.order}] ${s.timingMode} delay=${s.delayMinutes}m channel=${s.channel}`)
    }

    const now = new Date()
    const upcoming = await prisma.interviewMeeting.findMany({
      where: {
        workspaceId: rule.workspaceId,
        scheduledStart: { gt: now },
        ...(rule.flowId ? { session: { flowId: rule.flowId } } : {}),
      },
      select: {
        sessionId: true, scheduledStart: true,
        session: { select: { candidateName: true, candidateEmail: true } },
      },
      orderBy: { scheduledStart: 'asc' },
    })
    console.log(`  upcoming meetings affected: ${upcoming.length}`)
    for (const m of upcoming.slice(0, 10)) {
      console.log(`    • ${m.session?.candidateName ?? '(no name)'} <${m.session?.candidateEmail ?? '?'}> @ ${m.scheduledStart.toISOString()}`)
    }
    if (upcoming.length > 10) console.log(`    … and ${upcoming.length - 10} more`)

    const pending = await prisma.automationExecution.count({
      where: { automationRuleId: rule.id, status: { in: ['queued', 'pending'] } },
    })
    console.log(`  pending executions to cancel: ${pending}`)

    if (APPLY) {
      try {
        await autoBackfillRuleForUpcomingMeetings(rule.id)
        console.log(`  ✓ backfilled\n`)
      } catch (err) {
        console.error(`  ✗ FAILED: ${(err as Error).message}\n`)
      }
    } else {
      console.log(`  (dry run — pass --apply to backfill)\n`)
    }
  }

  console.log(`\nDone. Processed ${rules.length} rule(s).`)
}

main()
  .catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
