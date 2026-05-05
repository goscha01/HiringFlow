/**
 * One-shot repair for sessions whose pipelineStatus regressed to
 * 'invited_to_schedule' after a before_meeting reminder fired with a
 * scheduling link in the template. The fix in automation.ts (POST_SCHEDULING
 * triggers no longer regress status) prevents this going forward, but already
 * affected sessions need to be moved back to 'scheduled'.
 *
 * Heuristic: a session is mis-classified if pipelineStatus='invited_to_schedule'
 * AND it has an InterviewMeeting with scheduledStart > (created/updated time of
 * a recent reminder). To keep this simple and safe, we only touch sessions
 * that have an upcoming InterviewMeeting (scheduledStart > now) — those
 * candidates are clearly still scheduled.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/repair-regressed-pipeline-status.ts
 *   npx tsx --env-file=.env.production scripts/repair-regressed-pipeline-status.ts --apply
 */

import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient()

async function main() {
  const now = new Date()
  const candidates = await prisma.session.findMany({
    where: {
      pipelineStatus: 'invited_to_schedule',
      interviewMeetings: {
        some: { scheduledStart: { gt: now } },
      },
    },
    select: {
      id: true, candidateName: true, candidateEmail: true, workspaceId: true,
      interviewMeetings: {
        where: { scheduledStart: { gt: now } },
        orderBy: { scheduledStart: 'asc' },
        select: { scheduledStart: true, meetingUri: true },
      },
    },
  })

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Sessions in invited_to_schedule with upcoming meetings: ${candidates.length}\n`)

  for (const s of candidates) {
    const next = s.interviewMeetings[0]
    console.log(`  • ${s.candidateName ?? '(no name)'} <${s.candidateEmail ?? '?'}>`)
    console.log(`    next meeting: ${next.scheduledStart.toISOString()} ${next.meetingUri}`)
    console.log(`    sessionId: ${s.id}`)
    if (APPLY) {
      await prisma.session.update({
        where: { id: s.id },
        data: { pipelineStatus: 'scheduled' },
      })
      console.log(`    ✓ moved to scheduled`)
    }
    console.log()
  }

  console.log(`Done. ${APPLY ? 'Updated' : 'Would update'} ${candidates.length} session(s).`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
