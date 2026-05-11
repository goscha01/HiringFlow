/**
 * Backfill InterviewMeetingArtifact for every existing meeting.
 *
 * Scans each workspace's "Meet Recordings" folder for files (recordings,
 * transcripts, Gemini Notes) whose Drive createdTime falls inside the
 * meeting's scheduled window (-1h / +4h), then upserts a row per file.
 *
 * Idempotent: re-runs are safe — the upsert key is
 * (interviewMeetingId, driveFileId), so existing rows are not duplicated.
 *
 * Run with prod DATABASE_URL + the Google OAuth env vars loaded:
 *   set -a; source <(tr -d '\r' < .env.prod); set +a
 *   npx tsx scripts/backfill-meeting-artifacts.ts
 *
 * Optional flag: --workspace=<id> to limit to one workspace.
 * Optional flag: --meeting=<id> to limit to one meeting.
 */

import { PrismaClient } from '@prisma/client'
import { getAuthedClientForWorkspace } from '../src/lib/google'
import { searchMeetRecordings, searchMeetTranscripts, findMeetRecordingsFolderId } from '../src/lib/meet/google-drive'
import { recordArtifact } from '../src/lib/meet/artifacts'

const prisma = new PrismaClient()

const DRIVE_V3 = 'https://www.googleapis.com/drive/v3'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime?: string
}

async function searchGeminiNotes(client: import('google-auth-library').OAuth2Client, opts: {
  folderId: string | null
  candidateName: string
  createdAfter: Date
  createdBefore: Date
}): Promise<DriveFile[]> {
  const tok = await client.getAccessToken()
  if (!tok?.token) throw new Error('No Drive token')
  const safeName = opts.candidateName.replace(/'/g, "\\'")
  const conds = [
    "mimeType='application/vnd.google-apps.document'",
    `name contains 'Notes by Gemini'`,
    `name contains '${safeName}'`,
    "trashed=false",
    `createdTime>='${opts.createdAfter.toISOString()}'`,
    `createdTime<='${opts.createdBefore.toISOString()}'`,
  ]
  if (opts.folderId) conds.push(`'${opts.folderId}' in parents`)
  const q = encodeURIComponent(conds.join(' and '))
  const fields = encodeURIComponent('files(id,name,mimeType,createdTime)')
  const res = await fetch(`${DRIVE_V3}/files?q=${q}&fields=${fields}&pageSize=10&orderBy=createdTime%20desc`, {
    headers: { Authorization: `Bearer ${tok.token}` },
  })
  if (!res.ok) {
    console.warn('  [gemini] search failed', res.status)
    return []
  }
  const body = await res.json() as { files?: DriveFile[] }
  return body.files ?? []
}

async function processMeeting(meetingId: string): Promise<{ recordings: number; transcripts: number; notes: number; skipped: boolean }> {
  const meeting = await prisma.interviewMeeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true, workspaceId: true, sessionId: true,
      meetSpaceName: true, scheduledStart: true, scheduledEnd: true,
      driveRecordingFileId: true, driveTranscriptFileId: true,
      driveGeminiNotesFileId: true, attendanceSheetFileId: true,
      session: { select: { candidateName: true } },
    },
  })
  if (!meeting || !meeting.session?.candidateName) {
    return { recordings: 0, transcripts: 0, notes: 0, skipped: true }
  }

  const authed = await getAuthedClientForWorkspace(meeting.workspaceId)
  if (!authed) return { recordings: 0, transcripts: 0, notes: 0, skipped: true }

  const integ = await prisma.googleIntegration.findUnique({
    where: { workspaceId: meeting.workspaceId },
    select: { meetRecordingsFolderId: true },
  })
  let folderId = integ?.meetRecordingsFolderId ?? null
  if (!folderId) {
    folderId = await findMeetRecordingsFolderId(authed.client).catch(() => null)
  }

  const candidateName = meeting.session.candidateName
  const start = meeting.scheduledStart
  const end = meeting.scheduledEnd
  const createdAfter = new Date(start.getTime() - 60 * 60 * 1000)
  const createdBefore = new Date(end.getTime() + 4 * 60 * 60 * 1000)

  let recordings = 0, transcripts = 0, notes = 0

  // Catch-all: any file id pinned in the legacy denormalized columns. The
  // name-filtered searches below sometimes miss files (e.g. a Gemini Notes
  // doc named after only the host when the candidate hadn't accepted the
  // calendar invite), so we look those up directly via files.get and record
  // them with their real createdTime + filename.
  const tok = await authed.client.getAccessToken()
  if (tok?.token) {
    const fetchMeta = async (fileId: string): Promise<{ id: string; name: string; createdTime?: string } | null> => {
      const fields = encodeURIComponent('id,name,createdTime')
      const res = await fetch(`${DRIVE_V3}/files/${fileId}?fields=${fields}`, {
        headers: { Authorization: `Bearer ${tok.token}` },
      })
      if (!res.ok) return null
      return res.json() as Promise<{ id: string; name: string; createdTime?: string }>
    }
    const legacy: Array<['recording' | 'transcript' | 'gemini_notes' | 'attendance_sheet', string | null]> = [
      ['recording', meeting.driveRecordingFileId],
      ['transcript', meeting.driveTranscriptFileId],
      ['gemini_notes', meeting.driveGeminiNotesFileId],
      ['attendance_sheet', meeting.attendanceSheetFileId],
    ]
    for (const [kind, fileId] of legacy) {
      if (!fileId) continue
      const meta = await fetchMeta(fileId).catch(() => null)
      if (!meta) continue
      const inserted = await recordArtifact(meeting.id, kind, {
        driveFileId: meta.id,
        fileName: meta.name,
        meetSpaceName: meeting.meetSpaceName,
        driveCreatedTime: meta.createdTime ? new Date(meta.createdTime) : new Date(),
      })
      if (inserted) {
        if (kind === 'recording') recordings++
        else if (kind === 'transcript') transcripts++
        else if (kind === 'gemini_notes') notes++
      }
    }
  }

  const recs = await searchMeetRecordings(authed.client, {
    folderId, candidateName, createdAfter, createdBefore, limit: 10,
  }).catch((err) => { console.warn('  [rec] search failed', err.message); return [] })
  for (const f of recs) {
    if (await recordArtifact(meeting.id, 'recording', {
      driveFileId: f.id,
      fileName: f.name,
      meetSpaceName: meeting.meetSpaceName,
      driveCreatedTime: f.createdTime ? new Date(f.createdTime) : new Date(),
    })) recordings++
  }

  const trans = await searchMeetTranscripts(authed.client, {
    folderId, candidateName, createdAfter, createdBefore, limit: 10,
  }).catch((err) => { console.warn('  [transcript] search failed', err.message); return [] })
  for (const f of trans) {
    if (await recordArtifact(meeting.id, 'transcript', {
      driveFileId: f.id,
      fileName: f.name,
      meetSpaceName: meeting.meetSpaceName,
      driveCreatedTime: f.createdTime ? new Date(f.createdTime) : new Date(),
    })) transcripts++
  }

  const ge = await searchGeminiNotes(authed.client, {
    folderId, candidateName, createdAfter, createdBefore,
  }).catch((err) => { console.warn('  [gemini] search failed', err.message); return [] })
  for (const f of ge) {
    if (await recordArtifact(meeting.id, 'gemini_notes', {
      driveFileId: f.id,
      fileName: f.name,
      meetSpaceName: meeting.meetSpaceName,
      driveCreatedTime: f.createdTime ? new Date(f.createdTime) : new Date(),
    })) notes++
  }

  return { recordings, transcripts, notes, skipped: false }
}

async function main() {
  const args = process.argv.slice(2)
  const wsFilter = args.find((a) => a.startsWith('--workspace='))?.split('=')[1]
  const meetingFilter = args.find((a) => a.startsWith('--meeting='))?.split('=')[1]

  const meetings = await prisma.interviewMeeting.findMany({
    where: {
      ...(wsFilter ? { workspaceId: wsFilter } : {}),
      ...(meetingFilter ? { id: meetingFilter } : {}),
    },
    select: { id: true, workspaceId: true, scheduledStart: true, sessionId: true },
    orderBy: { scheduledStart: 'desc' },
  })

  console.log(`Backfilling artifacts for ${meetings.length} meeting(s)\n`)
  let total = { recordings: 0, transcripts: 0, notes: 0, skipped: 0 }
  for (const m of meetings) {
    process.stdout.write(`  ${m.id}  ${m.scheduledStart.toISOString().slice(0, 16)}  `)
    try {
      const res = await processMeeting(m.id)
      if (res.skipped) {
        console.log('SKIPPED (no candidate name / no Google auth)')
        total.skipped++
      } else {
        console.log(`+${res.recordings} rec  +${res.transcripts} trans  +${res.notes} notes`)
        total.recordings += res.recordings
        total.transcripts += res.transcripts
        total.notes += res.notes
      }
    } catch (err) {
      console.log('ERROR:', (err as Error).message)
    }
  }

  console.log(`\nDone. Inserted: ${total.recordings} recordings, ${total.transcripts} transcripts, ${total.notes} notes. Skipped: ${total.skipped}.`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
