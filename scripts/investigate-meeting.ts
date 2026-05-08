/**
 * Investigate one candidate's Meet pipeline end-to-end. Read-only.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/investigate-meeting.ts "Heather Simmons" dotenv_config_path=.env.production
 */
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import { createDecipheriv, createHash } from 'crypto'

const prisma = new PrismaClient()
const ALGO = 'aes-256-gcm'
const MEET_BASE = 'https://meet.googleapis.com/v2'
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'

function decrypt(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':')
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || ''
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY or NEXTAUTH_SECRET required')
  const key = createHash('sha256').update(secret).digest()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
}

function header(s: string) { console.log(`\n=== ${s} ===`) }

async function main() {
  const needle = (process.argv[2] || 'Heather').toLowerCase()
  header(`Searching candidates matching "${needle}"`)

  const sessions = await prisma.session.findMany({
    where: { candidateName: { contains: needle, mode: 'insensitive' } },
    select: {
      id: true, workspaceId: true, candidateName: true, candidateEmail: true,
      pipelineStatus: true, rejectionReason: true, rejectionReasonAt: true,
      startedAt: true,
    },
    orderBy: { startedAt: 'desc' },
    take: 10,
  })
  console.log(`found ${sessions.length} session(s)`)
  sessions.forEach(s => console.log(' -', s.id, '|', s.candidateName, '|', s.candidateEmail, '|', s.pipelineStatus, '| ws=', s.workspaceId))
  if (sessions.length === 0) return

  for (const s of sessions) {
    header(`Session ${s.id} — ${s.candidateName}`)

    const meetings = await prisma.interviewMeeting.findMany({
      where: { sessionId: s.id },
      orderBy: { scheduledStart: 'desc' },
    })
    console.log(`InterviewMeetings: ${meetings.length}`)
    for (const m of meetings) {
      console.log('  meeting', m.id)
      console.log('    space=', m.meetSpaceName, ' code=', m.meetingCode)
      console.log('    scheduled=', m.scheduledStart?.toISOString(), '→', m.scheduledEnd?.toISOString())
      console.log('    actualStart=', m.actualStart?.toISOString() ?? 'null', ' actualEnd=', m.actualEnd?.toISOString() ?? 'null')
      console.log('    recordingEnabled=', m.recordingEnabled, ' recordingState=', m.recordingState, ' provider=', m.recordingProvider)
      console.log('    transcriptState=', m.transcriptState)
      console.log('    driveRecordingFileId=', m.driveRecordingFileId)
      console.log('    workspaceEventsSubName=', m.workspaceEventsSubName)
      console.log('    subExpiresAt=', m.workspaceEventsSubExpiresAt?.toISOString() ?? 'null')
      console.log('    meetApiSyncedAt=', m.meetApiSyncedAt?.toISOString() ?? 'null')
      const rawEvts = (m.rawEvents as unknown[] | null) ?? []
      console.log('    rawEvents.length=', rawEvts.length)
      const parts = (m.participants as unknown[] | null) ?? []
      console.log('    participants.length=', parts.length, parts.length ? JSON.stringify(parts) : '')
    }

    const evts = await prisma.schedulingEvent.findMany({
      where: { sessionId: s.id },
      orderBy: { eventAt: 'asc' },
      select: { eventType: true, eventAt: true, metadata: true },
    })
    console.log(`SchedulingEvents: ${evts.length}`)
    for (const e of evts) {
      console.log('  ', e.eventAt.toISOString(), e.eventType, '|', JSON.stringify(e.metadata))
    }

    const integ = await prisma.googleIntegration.findUnique({
      where: { workspaceId: s.workspaceId },
    })
    if (!integ) { console.log('No GoogleIntegration on workspace'); continue }
    header(`GoogleIntegration (workspace=${s.workspaceId})`)
    console.log('  email=', integ.googleEmail, ' userId=', integ.googleUserId, ' displayName=', integ.googleDisplayName)
    console.log('  hostedDomain=', integ.hostedDomain)
    console.log('  recordingCapable=', integ.recordingCapable, ' reason=', integ.recordingCapabilityReason, ' checkedAt=', integ.recordingCapabilityCheckedAt?.toISOString())
    console.log('  grantedScopes=', integ.grantedScopes)
    console.log('  meetRecordingsFolderId=', integ.meetRecordingsFolderId)

    const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
    oauth.setCredentials({
      refresh_token: decrypt(integ.refreshToken),
      access_token: integ.accessToken ? decrypt(integ.accessToken) : undefined,
      expiry_date: integ.accessExpiresAt?.getTime(),
    })
    const tok = (await oauth.getAccessToken())?.token
    if (!tok) { console.log('No token'); continue }

    for (const m of meetings) {
      header(`Meet API for ${m.meetSpaceName}`)

      // Get space config
      const spaceResp = await fetch(`${MEET_BASE}/${m.meetSpaceName}`, { headers: { Authorization: `Bearer ${tok}` } })
      console.log('GET space', spaceResp.status)
      if (spaceResp.ok) {
        const space = await spaceResp.json() as Record<string, unknown>
        console.log(JSON.stringify(space, null, 2).slice(0, 2000))
      } else {
        console.log(await spaceResp.text())
      }

      // conferenceRecords
      const filter = encodeURIComponent(`space.name="${m.meetSpaceName}"`)
      const crResp = await fetch(`${MEET_BASE}/conferenceRecords?filter=${filter}`, { headers: { Authorization: `Bearer ${tok}` } })
      console.log('\nGET conferenceRecords', crResp.status)
      if (crResp.ok) {
        const data = await crResp.json() as { conferenceRecords?: Array<{ name: string; startTime?: string; endTime?: string }> }
        const confs = data.conferenceRecords || []
        console.log('found', confs.length, 'conference(s)')
        for (const c of confs) {
          console.log(' -', c.name, '|', c.startTime, '→', c.endTime || '(ongoing)')

          const pResp = await fetch(`${MEET_BASE}/${c.name}/participants`, { headers: { Authorization: `Bearer ${tok}` } })
          if (pResp.ok) {
            const pd = await pResp.json() as { participants?: Array<unknown> }
            console.log('   participants:', JSON.stringify(pd.participants ?? [], null, 2).slice(0, 1500))
          } else { console.log('   participants ERR', pResp.status, await pResp.text()) }

          const rResp = await fetch(`${MEET_BASE}/${c.name}/recordings`, { headers: { Authorization: `Bearer ${tok}` } })
          if (rResp.ok) {
            const rd = await rResp.json() as { recordings?: Array<unknown> }
            console.log('   recordings:', JSON.stringify(rd.recordings ?? [], null, 2).slice(0, 1500))
          } else { console.log('   recordings ERR', rResp.status, await rResp.text()) }

          const tResp = await fetch(`${MEET_BASE}/${c.name}/transcripts`, { headers: { Authorization: `Bearer ${tok}` } })
          if (tResp.ok) {
            const td = await tResp.json() as { transcripts?: Array<unknown> }
            console.log('   transcripts:', JSON.stringify(td.transcripts ?? [], null, 2).slice(0, 1500))
          } else { console.log('   transcripts ERR', tResp.status, await tResp.text()) }
        }
      } else { console.log(await crResp.text()) }
    }

    // Drive search around the meeting window
    if (meetings[0]) {
      const m = meetings[0]
      const start = m.scheduledStart!
      const end = m.scheduledEnd!
      header(`Drive scan ±3h around ${start.toISOString()} → ${end.toISOString()}`)

      const after = new Date(start.getTime() - 3 * 3600_000).toISOString()
      const before = new Date(end.getTime() + 6 * 3600_000).toISOString()
      const q = encodeURIComponent(`createdTime>='${after}' and createdTime<='${before}' and trashed=false`)
      const fields = encodeURIComponent('files(id,name,mimeType,createdTime,modifiedTime,parents,owners(emailAddress),webViewLink,size)')
      const dResp = await fetch(`${DRIVE_BASE}/files?q=${q}&fields=${fields}&pageSize=50&orderBy=createdTime+desc`, { headers: { Authorization: `Bearer ${tok}` } })
      if (dResp.ok) {
        const dd = await dResp.json() as { files?: Array<{ id: string; name: string; mimeType: string; createdTime?: string; webViewLink?: string }> }
        const files = dd.files || []
        console.log('files:', files.length)
        for (const f of files) console.log(' -', f.createdTime, '|', f.mimeType, '|', f.name, '|', f.id)
      } else { console.log(await dResp.text()) }

      // Specifically look for sheets named like attendance
      header(`Drive scan: spreadsheets named like 'Attendance' or 'Meet'`)
      const q2 = encodeURIComponent("(name contains 'Attendance' or name contains 'attendance' or name contains 'Meet') and trashed=false")
      const d2 = await fetch(`${DRIVE_BASE}/files?q=${q2}&fields=${fields}&pageSize=50&orderBy=createdTime+desc`, { headers: { Authorization: `Bearer ${tok}` } })
      if (d2.ok) {
        const dd = await d2.json() as { files?: Array<{ id: string; name: string; mimeType: string; createdTime?: string }> }
        const files = dd.files || []
        console.log('files:', files.length)
        for (const f of files.slice(0, 25)) console.log(' -', f.createdTime, '|', f.mimeType, '|', f.name, '|', f.id)
      } else { console.log(await d2.text()) }
    }
  }
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
