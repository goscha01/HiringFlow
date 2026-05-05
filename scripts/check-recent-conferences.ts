/**
 * Read-only: list recent conferenceRecords for the workspace's host account
 * to see what Meet spaces actually had conferences (regardless of which
 * InterviewMeeting we have). Helps diagnose why a meeting that "happened"
 * shows actualStart=null on our side.
 */
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import { createDecipheriv, createHash } from 'crypto'

const prisma = new PrismaClient()
const ALGO = 'aes-256-gcm'
const MEET_BASE = 'https://meet.googleapis.com/v2'

function decrypt(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':')
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || ''
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY or NEXTAUTH_SECRET required')
  const key = createHash('sha256').update(secret).digest()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
}

async function main() {
  const integ = await prisma.googleIntegration.findUnique({
    where: { workspaceId: '739bcd71-69fd-4b30-a39e-242521b7ab20' },
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

  // No filter = all conferences host can see, most-recent first.
  const resp = await fetch(`${MEET_BASE}/conferenceRecords?pageSize=20`, {
    headers: { Authorization: `Bearer ${tok}` },
  })
  console.log('GET conferenceRecords status', resp.status)
  if (!resp.ok) { console.log(await resp.text()); return }
  const data = await resp.json() as {
    conferenceRecords?: Array<{ name: string; space?: string; startTime?: string; endTime?: string }>,
  }
  const records = data.conferenceRecords ?? []
  console.log(`found ${records.length} conferences\n`)

  // Look up which of these spaces we have InterviewMeetings for.
  const spaceNames = records.map((r) => r.space).filter((s): s is string => !!s)
  const meetings = await prisma.interviewMeeting.findMany({
    where: { meetSpaceName: { in: spaceNames } },
    select: {
      meetSpaceName: true, meetingCode: true, scheduledStart: true,
      actualStart: true, actualEnd: true,
      session: { select: { candidateName: true, candidateEmail: true } },
    },
  })
  const bySpace = new Map(meetings.map((m) => [m.meetSpaceName, m]))

  for (const r of records) {
    const m = r.space ? bySpace.get(r.space) : undefined
    console.log(`conf ${r.name}`)
    console.log(`  space=${r.space} start=${r.startTime} end=${r.endTime ?? 'in_progress'}`)
    if (m) {
      console.log(`  ↳ matches InterviewMeeting for ${m.session?.candidateName} <${m.session?.candidateEmail}>`)
      console.log(`     code=${m.meetingCode} actualStart=${m.actualStart?.toISOString() ?? 'null'} actualEnd=${m.actualEnd?.toISOString() ?? 'null'}`)
    } else {
      console.log(`  ↳ NO matching InterviewMeeting in our DB`)
    }
    console.log()
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
