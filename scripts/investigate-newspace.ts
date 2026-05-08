/**
 * Probe the *current* Meet space the candidate actually joined (post-reschedule),
 * since the InterviewMeeting row points at the stale old space.
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
  const key = createHash('sha256').update(secret).digest()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
}

async function main() {
  const NEW_CODE = 'yuw-xjho-bro'
  const WS = '739bcd71-69fd-4b30-a39e-242521b7ab20'

  const integ = await prisma.googleIntegration.findUnique({ where: { workspaceId: WS } })
  if (!integ) throw new Error('no integ')
  const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
  oauth.setCredentials({
    refresh_token: decrypt(integ.refreshToken),
    access_token: integ.accessToken ? decrypt(integ.accessToken) : undefined,
    expiry_date: integ.accessExpiresAt?.getTime(),
  })
  const tok = (await oauth.getAccessToken())?.token!

  console.log(`=== GET space by code ${NEW_CODE} ===`)
  const r = await fetch(`${MEET_BASE}/spaces/${NEW_CODE}`, { headers: { Authorization: `Bearer ${tok}` } })
  console.log('status', r.status)
  const space = await r.json() as Record<string, unknown> & { name?: string }
  console.log(JSON.stringify(space, null, 2))

  if (space.name) {
    const filter = encodeURIComponent(`space.name="${space.name}"`)
    const cr = await fetch(`${MEET_BASE}/conferenceRecords?filter=${filter}`, { headers: { Authorization: `Bearer ${tok}` } })
    console.log(`\n=== conferenceRecords for ${space.name} ===`)
    console.log('status', cr.status)
    const crData = await cr.json() as { conferenceRecords?: Array<{ name: string; startTime?: string; endTime?: string }> }
    console.log('found', (crData.conferenceRecords||[]).length, 'conference(s)')
    for (const c of crData.conferenceRecords || []) {
      console.log(' -', c.name, '|', c.startTime, '→', c.endTime || '(ongoing)')
      const pr = await fetch(`${MEET_BASE}/${c.name}/participants`, { headers: { Authorization: `Bearer ${tok}` } })
      if (pr.ok) console.log('   participants:', JSON.stringify((await pr.json() as Record<string, unknown>).participants ?? [], null, 2))
      const re = await fetch(`${MEET_BASE}/${c.name}/recordings`, { headers: { Authorization: `Bearer ${tok}` } })
      if (re.ok) console.log('   recordings:', JSON.stringify((await re.json() as Record<string, unknown>).recordings ?? [], null, 2))
      const tr = await fetch(`${MEET_BASE}/${c.name}/transcripts`, { headers: { Authorization: `Bearer ${tok}` } })
      if (tr.ok) console.log('   transcripts:', JSON.stringify((await tr.json() as Record<string, unknown>).transcripts ?? [], null, 2))
    }
  }

  // Wider Drive scan — anything created in May 2026 in this drive
  console.log(`\n=== Drive: anything created 2026-05-04..05 ===`)
  const after = '2026-05-04T00:00:00Z', before = '2026-05-05T00:00:00Z'
  const q = encodeURIComponent(`createdTime>='${after}' and createdTime<='${before}' and trashed=false`)
  const fields = encodeURIComponent('files(id,name,mimeType,createdTime,parents,owners(emailAddress))')
  const dr = await fetch(`${DRIVE_BASE}/files?q=${q}&fields=${fields}&pageSize=50&orderBy=createdTime+desc`, { headers: { Authorization: `Bearer ${tok}` } })
  if (dr.ok) {
    const dd = await dr.json() as { files?: Array<{ id: string; name: string; mimeType: string; createdTime?: string }> }
    console.log('files:', (dd.files||[]).length)
    for (const f of dd.files||[]) console.log(' -', f.createdTime, '|', f.mimeType, '|', f.name)
  } else console.log(await dr.text())

  // Look inside Meet Recordings folder
  console.log(`\n=== Meet Recordings folder contents (latest 25) ===`)
  if (integ.meetRecordingsFolderId) {
    const q2 = encodeURIComponent(`'${integ.meetRecordingsFolderId}' in parents and trashed=false`)
    const dr2 = await fetch(`${DRIVE_BASE}/files?q=${q2}&fields=${fields}&pageSize=25&orderBy=createdTime+desc`, { headers: { Authorization: `Bearer ${tok}` } })
    if (dr2.ok) {
      const dd = await dr2.json() as { files?: Array<{ id: string; name: string; mimeType: string; createdTime?: string }> }
      console.log('files:', (dd.files||[]).length)
      for (const f of dd.files||[]) console.log(' -', f.createdTime, '|', f.mimeType, '|', f.name)
    }
  }

  // Also any spreadsheet containing 'Heather' or 'attendance' anywhere
  console.log(`\n=== Drive spreadsheets containing 'Heather' ===`)
  const q3 = encodeURIComponent(`mimeType='application/vnd.google-apps.spreadsheet' and (name contains 'Heather' or name contains 'attendance' or name contains 'Attendance' or name contains 'meeting' or name contains 'Meet') and trashed=false`)
  const dr3 = await fetch(`${DRIVE_BASE}/files?q=${q3}&fields=${fields}&pageSize=25&orderBy=createdTime+desc`, { headers: { Authorization: `Bearer ${tok}` } })
  if (dr3.ok) {
    const dd = await dr3.json() as { files?: Array<{ id: string; name: string; mimeType: string; createdTime?: string }> }
    console.log('files:', (dd.files||[]).length)
    for (const f of dd.files||[]) console.log(' -', f.createdTime, '|', f.mimeType, '|', f.name)
  }

  // List all files modified in last 3 days
  console.log(`\n=== ANY file modified after 2026-05-03 (last 50) ===`)
  const q4 = encodeURIComponent(`modifiedTime>='2026-05-03T00:00:00Z' and trashed=false`)
  const dr4 = await fetch(`${DRIVE_BASE}/files?q=${q4}&fields=${fields}&pageSize=50&orderBy=modifiedTime+desc`, { headers: { Authorization: `Bearer ${tok}` } })
  if (dr4.ok) {
    const dd = await dr4.json() as { files?: Array<{ id: string; name: string; mimeType: string; createdTime?: string }> }
    console.log('files:', (dd.files||[]).length)
    for (const f of dd.files||[]) console.log(' -', f.createdTime, '|', f.mimeType, '|', f.name)
  }

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
