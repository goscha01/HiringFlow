/**
 * Diagnose why Nguyen's meeting (today 12pm EDT) didn't fire meeting_started
 * or meeting_ended. Checks:
 *   1) Does the Google Calendar event still point at spaces/QKj6KrJRtKAB
 *      (gxd-taus-vab)? Or did Calendly/Google regenerate the link?
 *   2) Is the Workspace Events subscription on that space still alive?
 *   3) Are there any conferenceRecords on the original space, or on any other
 *      space the host can see in the last 24h?
 *   4) Was there a meeting_rescheduled event we missed?
 */
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import { createDecipheriv, createHash } from 'crypto'

const prisma = new PrismaClient()
const ALGO = 'aes-256-gcm'
const MEET_BASE = 'https://meet.googleapis.com/v2'
const SESSION_ID = '74ba7278-65b9-4476-a5ab-81542fac430c'
const GOOGLE_EVENT_ID = 'nobd8gk9r925999uii1dpdi4tg'

function decrypt(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':')
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || ''
  const key = createHash('sha256').update(secret).digest()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
}

function header(s: string) { console.log(`\n=== ${s} ===`) }

async function main() {
  const session = await prisma.session.findUnique({
    where: { id: SESSION_ID },
    select: { id: true, workspaceId: true, candidateName: true },
  })
  if (!session) throw new Error('session not found')

  const meetings = await prisma.interviewMeeting.findMany({
    where: { sessionId: session.id },
    orderBy: { scheduledStart: 'desc' },
  })
  const recent = meetings[0]
  console.log(`Session: ${session.candidateName}`)
  console.log(`Most recent InterviewMeeting in our DB:`)
  console.log(`  meetingCode=${recent.meetingCode}`)
  console.log(`  meetSpaceName=${recent.meetSpaceName}`)
  console.log(`  meetingUri=${recent.meetingUri}`)
  console.log(`  googleCalendarEventId=${recent.googleCalendarEventId}`)
  console.log(`  scheduledStart=${recent.scheduledStart.toISOString()}`)
  console.log(`  workspaceEventsSubName=${recent.workspaceEventsSubName}`)
  console.log(`  subExpires=${recent.workspaceEventsSubExpiresAt?.toISOString() ?? 'null'}`)

  const integ = await prisma.googleIntegration.findUnique({
    where: { workspaceId: session.workspaceId },
  })
  if (!integ) throw new Error('no integration')

  const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
  oauth.setCredentials({
    refresh_token: decrypt(integ.refreshToken),
    access_token: integ.accessToken ? decrypt(integ.accessToken) : undefined,
    expiry_date: integ.accessExpiresAt?.getTime(),
  })
  const tok = (await oauth.getAccessToken())?.token
  if (!tok) throw new Error('no token')

  // ─── 1) What does the calendar event currently look like? ────────────────
  header('Google Calendar event')
  const cal = google.calendar({ version: 'v3', auth: oauth })
  try {
    const evResp = await cal.events.get({ calendarId: 'primary', eventId: GOOGLE_EVENT_ID })
    const ev = evResp.data
    console.log(`  status=${ev.status}`)
    console.log(`  summary=${ev.summary}`)
    console.log(`  start=${ev.start?.dateTime ?? ev.start?.date}`)
    console.log(`  end=${ev.end?.dateTime ?? ev.end?.date}`)
    console.log(`  hangoutLink=${ev.hangoutLink}`)
    console.log(`  location=${ev.location}`)
    console.log(`  conferenceData.entryPoints=${JSON.stringify(ev.conferenceData?.entryPoints, null, 2)}`)
    console.log(`  attendees=${(ev.attendees ?? []).map((a) => `${a.email}(${a.responseStatus})`).join(', ')}`)
    console.log(`  updated=${ev.updated}`)
    console.log(`  recurringEventId=${ev.recurringEventId ?? '-'}`)

    // Compare hangoutLink against our stored meetingUri.
    const ourCode = recent.meetingCode
    const calLink = ev.hangoutLink || ''
    const calCode = calLink.split('/').pop()
    if (calCode && calCode !== ourCode) {
      console.log(`\n  !! MISMATCH: calendar event Meet link is ${calCode}, our DB has ${ourCode}`)
      console.log(`  → Google regenerated the Meet link; meeting actually happened on ${calCode}, our subscription is on the old space`)
    } else {
      console.log(`\n  OK: calendar Meet link matches our stored meetingCode (${ourCode})`)
    }
  } catch (err) {
    console.log(`  events.get failed: ${(err as Error).message}`)
  }

  // ─── 2) Subscription status ──────────────────────────────────────────────
  header('Workspace Events subscription')
  if (recent.workspaceEventsSubName) {
    const subResp = await fetch(`https://workspaceevents.googleapis.com/v1/${recent.workspaceEventsSubName}`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
    console.log(`  GET subscription status=${subResp.status}`)
    if (subResp.ok) {
      const sub = await subResp.json() as Record<string, unknown>
      console.log(JSON.stringify(sub, null, 2))
    } else {
      console.log(`  ${await subResp.text()}`)
    }
  } else {
    console.log('  (no subscription stored)')
  }

  // ─── 3) conferenceRecords for THIS space ─────────────────────────────────
  header(`conferenceRecords for ${recent.meetSpaceName}`)
  const filter = encodeURIComponent(`space.name="${recent.meetSpaceName}"`)
  const cr = await fetch(`${MEET_BASE}/conferenceRecords?filter=${filter}&pageSize=10`, {
    headers: { Authorization: `Bearer ${tok}` },
  })
  console.log(`  status=${cr.status}`)
  if (cr.ok) {
    const data = await cr.json() as { conferenceRecords?: Array<Record<string, unknown>> }
    console.log(`  records: ${(data.conferenceRecords ?? []).length}`)
    for (const r of data.conferenceRecords ?? []) {
      console.log(`    ${JSON.stringify(r)}`)
    }
  } else {
    console.log(`  ${await cr.text()}`)
  }

  // ─── 4) any conferenceRecord since 6h ago across the host? ───────────────
  header('conferenceRecords across host (last 6h)')
  const sinceMs = Date.now() - 6 * 60 * 60 * 1000
  const sinceIso = new Date(sinceMs).toISOString()
  const f2 = encodeURIComponent(`start_time>="${sinceIso}"`)
  const cr2 = await fetch(`${MEET_BASE}/conferenceRecords?filter=${f2}&pageSize=20`, {
    headers: { Authorization: `Bearer ${tok}` },
  })
  console.log(`  status=${cr2.status} since=${sinceIso}`)
  if (cr2.ok) {
    const data = await cr2.json() as { conferenceRecords?: Array<{ name: string; space?: string; startTime?: string; endTime?: string }> }
    console.log(`  records: ${(data.conferenceRecords ?? []).length}`)
    for (const r of data.conferenceRecords ?? []) {
      console.log(`    ${r.name} space=${r.space} ${r.startTime} → ${r.endTime ?? 'in_progress'}`)
    }
  } else {
    console.log(`  ${await cr2.text()}`)
  }

  // ─── 5) recent SchedulingEvents for this session (any meeting_rescheduled?) ──
  header('Recent SchedulingEvents (last 7 days)')
  const evts = await prisma.schedulingEvent.findMany({
    where: {
      sessionId: SESSION_ID,
      eventAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { eventAt: 'asc' },
    select: { eventType: true, eventAt: true, metadata: true },
  })
  for (const e of evts) {
    console.log(`  ${e.eventAt.toISOString()} ${e.eventType} ${JSON.stringify(e.metadata).slice(0, 200)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
