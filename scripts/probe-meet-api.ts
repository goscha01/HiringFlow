/**
 * One-off probe: call Meet REST API directly for a known space and verify
 * conferenceRecords + participants are reachable. Used to validate the
 * sync-on-read approach before relying on it in production.
 *
 * Usage:
 *   DATABASE_URL=... TOKEN_ENCRYPTION_KEY=... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
 *     npx tsx scripts/probe-meet-api.ts spaces/FCscO3SBwV0B
 */

import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import { createDecipheriv, createHash } from 'crypto'

const ALGO = 'aes-256-gcm'

function decrypt(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':')
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || ''
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY or NEXTAUTH_SECRET required')
  const key = createHash('sha256').update(secret).digest()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])
  return dec.toString('utf8')
}

const MEET_BASE = 'https://meet.googleapis.com/v2'

async function main() {
  const space = process.argv[2]
  if (!space) {
    console.error('usage: tsx scripts/probe-meet-api.ts <meetSpaceName e.g. spaces/abc>')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  const meeting = await prisma.interviewMeeting.findFirst({
    where: { meetSpaceName: space },
    select: { workspaceId: true, sessionId: true },
  })
  if (!meeting) throw new Error(`No InterviewMeeting found for ${space}`)

  const integ = await prisma.googleIntegration.findUnique({
    where: { workspaceId: meeting.workspaceId },
    select: { refreshToken: true, accessToken: true, accessExpiresAt: true, googleEmail: true, googleUserId: true },
  })
  if (!integ) throw new Error('No GoogleIntegration on workspace')
  console.log('Connected as:', integ.googleEmail, 'userId:', integ.googleUserId)

  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
  )
  oauth.setCredentials({
    refresh_token: decrypt(integ.refreshToken),
    access_token: integ.accessToken ? decrypt(integ.accessToken) : undefined,
    expiry_date: integ.accessExpiresAt?.getTime(),
  })

  const tokenRes = await oauth.getAccessToken()
  const token = tokenRes?.token
  if (!token) throw new Error('Failed to obtain access token')

  console.log(`\n=== conferenceRecords for ${space}: ===`)
  const filter = encodeURIComponent(`space.name="${space}"`)
  const crResp = await fetch(`${MEET_BASE}/conferenceRecords?filter=${filter}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!crResp.ok) {
    console.error('error', crResp.status, await crResp.text())
    process.exit(2)
  }
  const crData = await crResp.json() as { conferenceRecords?: Array<{ name: string; startTime?: string; endTime?: string }> }
  const confs = crData.conferenceRecords || []
  console.log(`found ${confs.length} conference(s)`)
  for (const c of confs) console.log(' -', c.name, '|', c.startTime, '→', c.endTime || '(ongoing)')
  if (confs.length === 0) {
    console.log('\n→ No conferences. Sync would treat this as a definite no-show after grace window.')
    await prisma.$disconnect()
    return
  }

  const conf = [...confs].sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''))[0]
  console.log(`\n=== participants for ${conf.name}: ===`)
  const partsResp = await fetch(`${MEET_BASE}/${conf.name}/participants`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!partsResp.ok) {
    console.error('error', partsResp.status, await partsResp.text())
    process.exit(2)
  }
  const partsData = await partsResp.json() as { participants?: Array<{ name?: string; signedinUser?: { user?: string; displayName?: string }; anonymousUser?: { displayName?: string }; phoneUser?: { displayName?: string }; earliestStartTime?: string; latestEndTime?: string }> }
  const ps = partsData.participants || []
  console.log(`found ${ps.length} participant(s)`)
  for (const p of ps) {
    const userKey = p.signedinUser?.user || null
    const name = p.signedinUser?.displayName || p.anonymousUser?.displayName || p.phoneUser?.displayName || '(unknown)'
    console.log(' -', name, '| userKey:', userKey || '(anonymous/phone)', '| start:', p.earliestStartTime, '| end:', p.latestEndTime)
  }

  console.log(`\n=== recordings for ${conf.name}: ===`)
  const recResp = await fetch(`${MEET_BASE}/${conf.name}/recordings`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!recResp.ok) {
    console.error('error', recResp.status, await recResp.text())
  } else {
    const recData = await recResp.json() as { recordings?: Array<{ name: string; state?: string; driveDestination?: { file?: string } }> }
    const recs = recData.recordings || []
    console.log(`found ${recs.length} recording(s)`)
    for (const r of recs) console.log(' -', r.name, '| state:', r.state, '| driveFile:', r.driveDestination?.file)
  }

  // Compute what sync would do
  const hostUserId = integ.googleUserId
  const hostKey = hostUserId ? `users/${hostUserId}` : null
  const nonHost = ps.filter(p => p.signedinUser?.user !== hostKey).length
  console.log(`\n=== sync verdict: ===`)
  console.log(`hostKey: ${hostKey || '(no googleUserId yet — sync will self-heal via userinfo)'}`)
  console.log(`nonHostCount: ${nonHost}`)
  console.log(`noShow: ${ps.length === 0 || (hostKey && nonHost === 0) ? 'YES' : 'no'}`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
