/**
 * Aggressive search for any attendance-extension output in the user's Drive.
 * Tries every plausible name pattern + every recent CSV / sheet / export file.
 */
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import { createDecipheriv, createHash } from 'crypto'

const prisma = new PrismaClient()
const ALGO = 'aes-256-gcm'
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
  const integ = await prisma.googleIntegration.findFirst({ where: { googleEmail: 'sayapingeorge@gmail.com' } })
  if (!integ) throw new Error('no integ')
  const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
  oauth.setCredentials({
    refresh_token: decrypt(integ.refreshToken),
    access_token: integ.accessToken ? decrypt(integ.accessToken) : undefined,
    expiry_date: integ.accessExpiresAt?.getTime(),
  })
  const tok = (await oauth.getAccessToken())?.token!
  const fields = encodeURIComponent('files(id,name,mimeType,createdTime,modifiedTime,owners(emailAddress),parents)')

  const queries = [
    `name contains 'attendance'`,
    `name contains 'Attendance'`,
    `name contains 'roster'`,
    `name contains 'participants'`,
    `name contains 'Meet ' and modifiedTime>='2026-04-01T00:00:00Z'`,
    `mimeType='text/csv' and modifiedTime>='2026-04-01T00:00:00Z'`,
    `mimeType='application/vnd.google-apps.spreadsheet' and modifiedTime>='2026-04-01T00:00:00Z'`,
    `name contains 'Heather'`,
    `name contains 'hux-pgsu' or name contains 'yuw-xjho'`,  // Meet codes
  ]

  for (const q of queries) {
    console.log(`\n=== q: ${q} ===`)
    const url = `${DRIVE_BASE}/files?q=${encodeURIComponent(q + ' and trashed=false')}&fields=${fields}&pageSize=25&orderBy=modifiedTime+desc`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } })
    if (!r.ok) { console.log('ERR', r.status, await r.text()); continue }
    const body = await r.json() as { files?: Array<{ id: string; name: string; mimeType: string; createdTime?: string; modifiedTime?: string }> }
    const files = body.files || []
    console.log(`found ${files.length}`)
    for (const f of files.slice(0, 15)) console.log(' -', f.modifiedTime, '|', f.mimeType, '|', f.name, '|', f.id)
  }

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
