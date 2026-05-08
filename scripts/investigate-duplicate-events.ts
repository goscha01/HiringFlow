/**
 * Read-only check: any (sessionId, eventType, interviewMeetingId) tuples
 * with more than one row would indicate sync-on-read or the webhook
 * accidentally duplicated a SchedulingEvent. After the fallback rollout, we
 * specifically care about meeting_started / meeting_ended / meeting_no_show.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const dups = await prisma.$queryRawUnsafe<Array<{ session_id: string; event_type: string; interview_meeting_id: string; n: bigint }>>(`
    SELECT
      session_id,
      event_type,
      metadata->>'interviewMeetingId' AS interview_meeting_id,
      COUNT(*) AS n
    FROM scheduling_events
    WHERE event_type IN ('meeting_started','meeting_ended','meeting_no_show')
      AND metadata->>'interviewMeetingId' IS NOT NULL
    GROUP BY session_id, event_type, metadata->>'interviewMeetingId'
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 50;
  `)
  if (dups.length === 0) {
    console.log('OK: zero duplicate (sessionId, eventType, interviewMeetingId) tuples in scheduling_events')
  } else {
    console.log(`FOUND ${dups.length} duplicate tuples:`)
    for (const d of dups) console.log(' -', d.event_type, '| im=', d.interview_meeting_id, '| count=', d.n.toString(), '| session=', d.session_id)
  }
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
