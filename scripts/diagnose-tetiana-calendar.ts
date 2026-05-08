import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const wsId = '739bcd71-69fd-4b30-a39e-242521b7ab20'
  const sessionId = '44447679-dc84-40a6-9018-300f88c442c3'

  const gi = await prisma.googleIntegration.findUnique({
    where: { workspaceId: wsId },
    select: {
      id: true, googleEmail: true, googleUserId: true, calendarId: true,
      watchChannelId: true, watchResourceId: true, watchExpiresAt: true,
      syncToken: true, lastSyncedAt: true, accessExpiresAt: true,
      recordingCapable: true, recordingCapabilityReason: true, recordingCapabilityCheckedAt: true,
      grantedScopes: true,
    } as never,
  })
  console.log('GoogleIntegration:')
  console.log(gi)

  // All recent InterviewMeetings for this workspace — to see if sync is alive
  const recentMeetings = await prisma.interviewMeeting.findMany({
    where: { workspaceId: wsId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true, sessionId: true, googleCalendarEventId: true,
      scheduledStart: true, createdAt: true, participants: true,
    },
  })
  console.log(`\nRecent InterviewMeetings in workspace (${recentMeetings.length}):`)
  for (const m of recentMeetings) {
    const partsRaw = m.participants as unknown
    const partsStr = JSON.stringify(partsRaw).slice(0, 200)
    console.log(`  ${m.createdAt.toISOString()}  meeting=${m.id}  session=${m.sessionId}  cal=${m.googleCalendarEventId}  start=${m.scheduledStart?.toISOString() ?? 'null'}`)
    console.log(`    participants=${partsStr}`)
  }

  // Recent SchedulingEvents for this workspace
  const recentEvents = await prisma.schedulingEvent.findMany({
    where: { workspaceId: wsId },
    orderBy: { eventAt: 'desc' },
    take: 15,
    select: { id: true, sessionId: true, eventType: true, eventAt: true, metadata: true },
  })
  console.log(`\nRecent SchedulingEvents in workspace (${recentEvents.length}):`)
  for (const e of recentEvents) {
    console.log(`  ${e.eventAt.toISOString()}  ${e.eventType.padEnd(22)}  session=${e.sessionId}  meta=${JSON.stringify(e.metadata).slice(0,160)}`)
  }

  // ProcessedWorkspaceEvent — recent rows might tell us if Pub/Sub is alive
  const procd = await prisma.$queryRaw<Array<{ id: string; event_type: string; processed_at: Date; meeting_id: string | null }>>`
    SELECT id, event_type, processed_at, meeting_id
    FROM "processed_workspace_events"
    ORDER BY processed_at DESC
    LIMIT 10
  `
  console.log(`\nRecent ProcessedWorkspaceEvent (global, last 10):`)
  for (const p of procd) console.log(`  ${p.processed_at.toISOString()}  ${p.event_type}  meeting=${p.meeting_id}`)

  // Look for the candidate by email anywhere in calendar event JSON / participants
  const candEmail = 'tetianakarpova58@gmail.com'
  const matches = await prisma.$queryRaw<Array<{ id: string; workspace_id: string; session_id: string | null; google_calendar_event_id: string | null; created_at: Date; scheduled_start: Date | null }>>`
    SELECT id, workspace_id, session_id, google_calendar_event_id, created_at, scheduled_start
    FROM "interview_meetings"
    WHERE participants::text ILIKE ${'%' + candEmail + '%'}
       OR raw_events::text ILIKE ${'%' + candEmail + '%'}
    ORDER BY created_at DESC LIMIT 10
  `
  console.log(`\nAny meeting referencing ${candEmail} (across workspaces): ${matches.length}`)
  for (const m of matches) console.log(`  meeting=${m.id} ws=${m.workspace_id} session=${m.session_id} cal=${m.google_calendar_event_id} created=${m.created_at.toISOString()} start=${m.scheduled_start?.toISOString() ?? 'null'}`)

  console.log('\n--- session id was', sessionId, '---')
}

main().catch(console.error).finally(() => prisma.$disconnect())
