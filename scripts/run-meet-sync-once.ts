/**
 * One-off invocation of the production sync-on-read pipeline against a single
 * meeting (or all past meetings in a workspace). Useful for verifying behavior
 * without waiting for the next listing-endpoint hit, and for force-running
 * past meetings whose data is stranded by the original webhook bug.
 *
 * Usage:
 *   DATABASE_URL=... TOKEN_ENCRYPTION_KEY=... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
 *     npx tsx scripts/run-meet-sync-once.ts [meetingId]
 */

import { PrismaClient } from '@prisma/client'
// Reuse the actual production sync function — same code path that runs from
// /api/candidates/[id]/interview-meetings.
import { syncMeetingFromMeetApi } from '../src/lib/meet/sync-on-read'

const prisma = new PrismaClient()

async function main() {
  const meetingId = process.argv[2]

  const meetings = await prisma.interviewMeeting.findMany({
    where: meetingId ? { id: meetingId } : {},
    select: {
      id: true, workspaceId: true, sessionId: true, meetSpaceName: true,
      scheduledStart: true, scheduledEnd: true, actualStart: true, actualEnd: true,
      recordingState: true, meetApiSyncedAt: true,
      session: { select: { candidateName: true, pipelineStatus: true } },
    },
    orderBy: { scheduledStart: 'asc' },
  })

  console.log(`Found ${meetings.length} meeting(s) to evaluate`)

  for (const m of meetings) {
    const past = m.scheduledEnd && m.scheduledEnd.getTime() < Date.now() - 15 * 60 * 1000
    console.log(`\n[${m.session.candidateName}] ${m.meetSpaceName}`)
    console.log(`  scheduledEnd=${m.scheduledEnd?.toISOString()} past+grace=${past}`)
    console.log(`  pre-sync: actualEnd=${m.actualEnd?.toISOString() ?? 'null'} recordingState=${m.recordingState} pipelineStatus=${m.session.pipelineStatus}`)

    if (!past) {
      console.log('  → meeting not past + grace; skipping (would no-op in production too)')
      continue
    }

    const updated = await syncMeetingFromMeetApi(m).catch((err) => {
      console.error('  → sync threw:', err.message)
      return false
    })
    console.log(`  → sync returned updated=${updated}`)

    const after = await prisma.interviewMeeting.findUnique({
      where: { id: m.id },
      select: {
        actualEnd: true, recordingState: true, driveRecordingFileId: true,
        session: { select: { pipelineStatus: true, rejectionReason: true } },
      },
    })
    console.log(`  post-sync: actualEnd=${after?.actualEnd?.toISOString() ?? 'null'} recordingState=${after?.recordingState} driveFile=${after?.driveRecordingFileId ?? 'null'}`)
    console.log(`             pipelineStatus=${after?.session.pipelineStatus} rejectionReason=${after?.session.rejectionReason ?? 'null'}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
