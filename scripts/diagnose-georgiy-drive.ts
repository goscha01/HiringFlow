import { PrismaClient } from '@prisma/client'
import { getAuthedClientForWorkspace } from '../src/lib/google'
const prisma = new PrismaClient()
const DRIVE_V3 = 'https://www.googleapis.com/drive/v3'

async function authedFetch(client: any, url: string) {
  const tok = await client.getAccessToken()
  return fetch(url, { headers: { Authorization: `Bearer ${tok.token}` } })
}

async function main() {
  const wsId = '739bcd71-69fd-4b30-a39e-242521b7ab20'
  const integ = await prisma.googleIntegration.findUnique({
    where: { workspaceId: wsId },
    select: {
      hostedDomain: true, attendanceExtensionEnabled: true, grantedScopes: true,
      meetRecordingsFolderId: true, googleDisplayName: true, googleUserId: true, googleEmail: true,
    },
  })
  console.log('INTEGRATION:', integ)

  const authed = await getAuthedClientForWorkspace(wsId)
  if (!authed) { console.log('NO AUTHED CLIENT'); return }

  // Georgiy's meeting: scheduledStart 2026-05-05T17:30:00Z, scheduledEnd 2026-05-05T18:00:00Z
  const start = new Date('2026-05-05T17:30:00Z')
  const end = new Date('2026-05-05T18:00:00Z')
  const after = new Date(start.getTime() - 2 * 60 * 60 * 1000).toISOString()
  const before = new Date(end.getTime() + 6 * 60 * 60 * 1000).toISOString()
  console.log(`\nSearching Drive for files created ${after} → ${before}`)

  // 1. ALL spreadsheets in window (broader than our extension token list)
  const q1 = encodeURIComponent([
    `mimeType='application/vnd.google-apps.spreadsheet'`,
    `trashed=false`,
    `createdTime>='${after}'`,
    `createdTime<='${before}'`,
  ].join(' and '))
  const fields = encodeURIComponent('files(id,name,mimeType,createdTime,modifiedTime,parents,webViewLink,owners)')
  const r1 = await authedFetch(authed.client, `${DRIVE_V3}/files?q=${q1}&fields=${fields}&pageSize=50&orderBy=createdTime%20desc`)
  const b1 = await r1.json() as any
  console.log(`\nALL SPREADSHEETS in window (${b1.files?.length ?? 0}):`)
  for (const f of b1.files ?? []) console.log(`  ${f.createdTime}  "${f.name}"  id=${f.id}  parents=${(f.parents||[]).join(',')}  owners=${(f.owners||[]).map((o:any)=>o.emailAddress).join(',')}`)

  // 2. ALL files in window with name containing "attendance" or "meet" (case-insensitive substring)
  const q2 = encodeURIComponent([
    `(name contains 'attendance' or name contains 'Attendance' or name contains 'roster' or name contains 'Roster' or name contains 'participants' or name contains 'Participants' or name contains 'Meet')`,
    `trashed=false`,
    `createdTime>='${after}'`,
    `createdTime<='${before}'`,
  ].join(' and '))
  const r2 = await authedFetch(authed.client, `${DRIVE_V3}/files?q=${q2}&fields=${fields}&pageSize=50&orderBy=createdTime%20desc`)
  const b2 = await r2.json() as any
  console.log(`\nFILES with attendance/meet keywords in window (${b2.files?.length ?? 0}):`)
  for (const f of b2.files ?? []) console.log(`  ${f.createdTime}  "${f.name}"  mime=${f.mimeType}  id=${f.id}`)

  // 3. Recent files of any type in window — broader
  const q3 = encodeURIComponent([
    `trashed=false`,
    `createdTime>='${after}'`,
    `createdTime<='${before}'`,
  ].join(' and '))
  const r3 = await authedFetch(authed.client, `${DRIVE_V3}/files?q=${q3}&fields=${fields}&pageSize=100&orderBy=createdTime%20desc`)
  const b3 = await r3.json() as any
  console.log(`\nALL recent files (${b3.files?.length ?? 0}, top 30):`)
  for (const f of (b3.files ?? []).slice(0, 30)) console.log(`  ${f.createdTime}  "${f.name}"  mime=${f.mimeType}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
