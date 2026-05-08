/**
 * Brute-force Drive scan for ANY file the Chrome attendance extension might
 * have written, regardless of expected naming convention.
 *
 * Tests every plausible signal:
 *   - by MIME (Sheets, CSV, Doc)
 *   - by recent activity window (24h / 48h / 7d)
 *   - by name keywords (Meet, Attendance, Roster, Participants, Debra, Veada,
 *     meeting code, date, candidate name, plus the empty-name case)
 *   - by parent folder (Meet Recordings, root, "extension" subfolders)
 *   - shared-with-me files (in case extension writes to extension-owned Drive
 *     and shares with the user)
 *   - app-data scope ("appDataFolder" — extensions sometimes use this)
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

interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime?: string
  modifiedTime?: string
  parents?: string[]
  owners?: Array<{ emailAddress?: string }>
  sharedWithMeTime?: string
  webViewLink?: string
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
  const fields = encodeURIComponent('files(id,name,mimeType,createdTime,modifiedTime,parents,owners(emailAddress),sharedWithMeTime,webViewLink)')

  async function q(name: string, query: string, opts: { spaces?: 'drive'|'appDataFolder'; pageSize?: number } = {}) {
    const params = new URLSearchParams()
    params.set('q', `${query} and trashed=false`)
    params.set('fields', `files(id,name,mimeType,createdTime,modifiedTime,parents,owners(emailAddress),sharedWithMeTime,webViewLink)`)
    params.set('pageSize', String(opts.pageSize ?? 50))
    params.set('orderBy', 'modifiedTime desc')
    if (opts.spaces) params.set('spaces', opts.spaces)
    const res = await fetch(`${DRIVE_BASE}/files?${params}`, { headers: { Authorization: `Bearer ${tok}` } })
    console.log(`\n=== ${name} ===`)
    if (!res.ok) { console.log('ERR', res.status, (await res.text()).slice(0, 250)); return [] as DriveFile[] }
    const body = await res.json() as { files?: DriveFile[] }
    const files = body.files ?? []
    console.log(`found ${files.length}`)
    for (const f of files.slice(0, 25)) {
      const owner = f.owners?.[0]?.emailAddress || '(no owner)'
      console.log(' -', f.modifiedTime, '|', f.mimeType, '|', f.name, '| owner=', owner, '| id=', f.id)
    }
    return files
  }

  // 1. ANY file modified in last 7 days
  await q('any modifiedTime >= 7 days ago', `modifiedTime>='2026-04-27T00:00:00Z'`)

  // 2. Sheets specifically, all time but recent
  await q('sheets modified in last 30 days', `mimeType='application/vnd.google-apps.spreadsheet' and modifiedTime>='2026-04-04T00:00:00Z'`)

  // 3. CSV anywhere
  await q('csv files (any time)', `mimeType='text/csv'`)

  // 4. By keyword (broad)
  for (const kw of ['Debra', 'Veada', 'tkg-ghyu', 'urf', 'attendance', 'Attendance', 'Roster', 'roster', 'Participant', 'participant', 'present', 'Present', 'extension', 'export', '2026-05-04', '20260504', '5/4/2026']) {
    await q(`name contains '${kw}'`, `name contains '${kw}'`, { pageSize: 10 })
  }

  // 5. Files NOT owned by the user (extension may own its output)
  await q('shared with me, last 7 days', `sharedWithMeTime>='2026-04-27T00:00:00Z'`)

  // 6. Files in the root of My Drive modified recently
  await q('root parent modified last 7 days', `'root' in parents and modifiedTime>='2026-04-27T00:00:00Z'`, { pageSize: 30 })

  // 7. Drive App Data (some extensions write here)
  await q('appDataFolder space', `'appDataFolder' in parents`, { spaces: 'appDataFolder' })

  // 8. Folders with "Meet" or "Attendance" in name
  await q('folders with Meet/Attendance keyword', `mimeType='application/vnd.google-apps.folder' and (name contains 'Meet' or name contains 'Attendance')`)

  // 9. Listed apps that have written to the user's Drive (data export style)
  console.log('\n=== Drive about: storage quotas + apps ===')
  const aboutR = await fetch(`${DRIVE_BASE}/about?fields=user(emailAddress,permissionId),storageQuota,maxImportSizes,canCreateDrives`, { headers: { Authorization: `Bearer ${tok}` } })
  if (aboutR.ok) console.log((await aboutR.text()).slice(0, 800))

  // 10. Inspect Drive activity for any third-party app writes (apps API)
  console.log('\n=== Drive: list installed Apps ===')
  const appsR = await fetch(`${DRIVE_BASE}/apps`, { headers: { Authorization: `Bearer ${tok}` } })
  if (appsR.ok) {
    const j = await appsR.json() as { items?: Array<{ name?: string; id?: string; useByDefault?: boolean }> }
    for (const a of (j.items || []).slice(0, 50)) console.log(' -', a.name, '|', a.id, '| default=', a.useByDefault)
  } else { console.log('apps endpoint:', appsR.status, (await appsR.text()).slice(0, 200)) }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
