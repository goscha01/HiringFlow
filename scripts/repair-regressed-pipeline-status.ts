/**
 * One-shot repair for sessions whose pipelineStatus regressed to
 * 'invited_to_schedule' (or the legacy 'scheduled' literal) after a
 * before_meeting reminder fired with a scheduling link in the template.
 *
 * Uses applyStageTrigger('meeting_scheduled') so the write resolves to the
 * workspace's configured funnel stage (e.g. "Interview scheduled" / stage_7
 * for Spotless Homes) rather than the legacy literal 'scheduled' which falls
 * back to "Application done" on the kanban.
 *
 * Heuristic: the session has an upcoming or recent InterviewMeeting and is
 * NOT already in a downstream stage (hired/rejected/meeting_ended). We trust
 * applyStageTrigger's furthest-stage-wins guard to decline if the candidate
 * is already further along.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/repair-regressed-pipeline-status.ts
 *   npx tsx --env-file=.env.production scripts/repair-regressed-pipeline-status.ts --apply
 */

import { PrismaClient } from '@prisma/client'
import { applyStageTrigger } from '../src/lib/funnel-stage-runtime'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient()

async function main() {
  // Catch BOTH the legacy 'scheduled' literal (which falls back to "Application
  // done" in custom funnels) and the regressed 'invited_to_schedule'.
  const candidates = await prisma.session.findMany({
    where: {
      pipelineStatus: { in: ['invited_to_schedule', 'scheduled'] },
      interviewMeetings: { some: {} },
    },
    select: {
      id: true, candidateName: true, candidateEmail: true,
      workspaceId: true, flowId: true, pipelineStatus: true,
      interviewMeetings: {
        orderBy: { scheduledStart: 'desc' },
        take: 1,
        select: { scheduledStart: true, meetingUri: true },
      },
    },
  })

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Sessions to evaluate: ${candidates.length}\n`)

  for (const s of candidates) {
    const next = s.interviewMeetings[0]
    console.log(`  • ${s.candidateName ?? '(no name)'} <${s.candidateEmail ?? '?'}>`)
    console.log(`    pipelineStatus: ${s.pipelineStatus}`)
    console.log(`    last meeting: ${next?.scheduledStart.toISOString() ?? '?'} ${next?.meetingUri ?? ''}`)
    console.log(`    sessionId: ${s.id}`)
    if (APPLY) {
      const result = await applyStageTrigger({
        sessionId: s.id,
        workspaceId: s.workspaceId,
        event: 'meeting_scheduled',
        flowId: s.flowId,
        legacyStatus: 'scheduled',
      })
      console.log(`    → wrote pipelineStatus=${result ?? '(no change)'}`)
    }
    console.log()
  }

  console.log(`Done.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
