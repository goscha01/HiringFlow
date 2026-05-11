/**
 * Personal-Gmail attendance fallback.
 *
 * Workspace Events Meet API and Meet REST `conferenceRecords` both return
 * nothing for personal `@gmail.com` and Workspace Individual accounts (
 * verified 2026-04-30 / 2026-05-04). To advance the candidate card past
 * "Meeting scheduled" on those tenants, we have to derive attendance from
 * artifacts Google *does* leave behind in the host's Drive:
 *
 *   1. **Notes by Gemini** Google Docs — auto-generated when the meeting's
 *      `autoSmartNotesGeneration` is ON (which is the personal-Gmail default).
 *      File appears in the host's "Meet Recordings" folder, named
 *      `"<NameA> and <NameB> - YYYY/MM/DD HH:MM TZ - Notes by Gemini"`. The
 *      file's existence + creation time is high-confidence evidence the
 *      meeting actually happened. The filename's name list is *unreliable*
 *      for attendance (Meet derives names from the calendar event, not who
 *      joined — see commit e8c87cc), so we use the file as a "meeting
 *      occurred" signal only, not as a no-show signal.
 *
 *   2. **Attendance-extension spreadsheet** — Google Sheets exported by the
 *      "Google Meet Attendance List" Chrome extension when the host enables
 *      it. If we find a sheet whose creation time matches the meeting window
 *      and whose rows include the candidate's email/name, we have a true
 *      attendance signal (can decide present vs no-show).
 *
 * Both signals are stored on `InterviewMeeting` (driveGeminiNotesFileId /
 * attendanceSheetFileId) so the UI can deep-link them. Sync-on-read uses the
 * presence/absence to emit idempotent meeting_started + meeting_ended events.
 *
 * Read-only Drive API. No file mutations. Keep the queries tight — Drive's
 * `files.list` cost scales with name/createdTime filters, and we run this on
 * every page load that touches the candidate.
 */

import type { OAuth2Client } from 'google-auth-library'

const DRIVE_V3 = 'https://www.googleapis.com/drive/v3'
const SHEETS_V4 = 'https://sheets.googleapis.com/v4/spreadsheets'

// Common naming patterns for the Chrome attendance extension's Sheet output.
// Different extensions in this category use slightly different names; matching
// any of these as a substring keeps us forward-compatible.
const ATTENDANCE_NAME_TOKENS = [
  'Attendance', 'attendance', 'Roster', 'roster', 'Meet Attendance', 'Participants',
]

export interface AttendanceSignal {
  /** What we found and where. */
  source: 'gemini_notes' | 'attendance_sheet' | 'recording'
  driveFileId: string
  fileName: string
  /** Creation time per Drive — usually a few minutes after the meeting ended. */
  createdAt: Date
  /**
   * For 'attendance_sheet' only: parsed rows that name candidate / host
   * presence. Other sources don't carry per-attendee data.
   */
  parsedRows?: AttendanceRow[]
  /**
   * Decision about whether the candidate showed up. Only meaningful for
   * 'attendance_sheet' (Gemini docs + recordings can't disambiguate; their
   * existence proves *someone* met but not *who*).
   */
  candidatePresent?: boolean
  /**
   * Every Drive file we found in the window for this signal source. Callers
   * persist all of them into InterviewMeetingArtifact even though only one
   * drives the lifecycle decision.
   */
  allFiles?: Array<{ id: string; name: string; createdAt: Date }>
}

export interface AttendanceRow {
  name: string | null
  email: string | null
  joinedAt: Date | null
  leftAt: Date | null
}

async function authedFetch(client: OAuth2Client, url: string): Promise<Response> {
  const tok = await client.getAccessToken()
  if (!tok?.token) throw new Error('No Drive access token')
  return fetch(url, { headers: { Authorization: `Bearer ${tok.token}` } })
}

interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime?: string
  modifiedTime?: string
  webViewLink?: string
}

/**
 * Look for "Notes by Gemini" docs whose creation time falls in the meeting's
 * window. Returns ALL matches so callers can persist every artifact found;
 * `findAttendanceForMeeting` separately picks the most recent for the
 * lifecycle signal.
 */
export async function findGeminiNotesForMeeting(
  client: OAuth2Client,
  opts: {
    folderId: string | null
    windowStart: Date
    windowEnd: Date
  },
): Promise<DriveFile[]> {
  // Drive's createdTime window — 1h before scheduled start through 4h after
  // scheduled end covers near-term timing skew + delayed Gemini finalization.
  const after = new Date(opts.windowStart.getTime() - 60 * 60 * 1000).toISOString()
  const before = new Date(opts.windowEnd.getTime() + 4 * 60 * 60 * 1000).toISOString()

  const conds = [
    "mimeType='application/vnd.google-apps.document'",
    `name contains 'Notes by Gemini'`,
    "trashed=false",
    `createdTime>='${after}'`,
    `createdTime<='${before}'`,
  ]
  if (opts.folderId) conds.push(`'${opts.folderId}' in parents`)
  const q = encodeURIComponent(conds.join(' and '))
  const fields = encodeURIComponent('files(id,name,mimeType,createdTime,modifiedTime,webViewLink)')
  const res = await authedFetch(client, `${DRIVE_V3}/files?q=${q}&fields=${fields}&pageSize=10&orderBy=createdTime%20desc`)
  if (!res.ok) {
    console.warn('[attendance] Gemini Notes search failed', res.status)
    return []
  }
  const body = await res.json() as { files?: DriveFile[] }
  return body.files ?? []
}

/**
 * Look for an attendance-extension spreadsheet whose creation time matches
 * the meeting window and whose name resembles the extension's outputs.
 */
export async function findAttendanceSheetForMeeting(
  client: OAuth2Client,
  opts: { windowStart: Date; windowEnd: Date },
): Promise<DriveFile | null> {
  const after = new Date(opts.windowStart.getTime() - 60 * 60 * 1000).toISOString()
  const before = new Date(opts.windowEnd.getTime() + 4 * 60 * 60 * 1000).toISOString()

  const nameClause = ATTENDANCE_NAME_TOKENS.map(t => `name contains '${t.replace(/'/g, "\\'")}'`).join(' or ')
  const q = encodeURIComponent([
    `mimeType='application/vnd.google-apps.spreadsheet'`,
    `(${nameClause})`,
    `trashed=false`,
    `createdTime>='${after}'`,
    `createdTime<='${before}'`,
  ].join(' and '))
  const fields = encodeURIComponent('files(id,name,mimeType,createdTime,modifiedTime,webViewLink)')
  const res = await authedFetch(client, `${DRIVE_V3}/files?q=${q}&fields=${fields}&pageSize=10&orderBy=createdTime%20desc`)
  if (!res.ok) {
    console.warn('[attendance] sheet search failed', res.status)
    return null
  }
  const body = await res.json() as { files?: DriveFile[] }
  return body.files?.[0] ?? null
}

/**
 * Read the first sheet of an attendance spreadsheet and parse into rows.
 * Tolerant of column-order variation: looks up name / email / joined / left
 * by header rather than position. Returns an empty array on parse failure.
 *
 * Requires the spreadsheets.readonly scope. Callers should check the
 * integration's grantedScopes before invoking; we propagate Sheets API
 * errors as-is.
 */
export async function readAttendanceRows(
  client: OAuth2Client,
  spreadsheetId: string,
): Promise<AttendanceRow[]> {
  const tok = await client.getAccessToken()
  if (!tok?.token) throw new Error('No Sheets access token')
  const res = await fetch(
    `${SHEETS_V4}/${spreadsheetId}/values/A1:Z1000?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${tok.token}` } },
  )
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text().catch(() => '')}`)
  const body = await res.json() as { values?: string[][] }
  const values = body.values ?? []
  if (values.length < 2) return []

  const header = values[0].map(h => (h || '').toString().trim().toLowerCase())
  const idxName = header.findIndex(h => h === 'name' || h === 'full name' || h === 'display name' || h === 'participant')
  const idxEmail = header.findIndex(h => h === 'email' || h === 'email address')
  const idxJoined = header.findIndex(h => /join/i.test(h))
  const idxLeft = header.findIndex(h => /left|leave/i.test(h))

  const rows: AttendanceRow[] = []
  for (let i = 1; i < values.length; i++) {
    const row = values[i]
    if (!row || row.length === 0) continue
    const name = idxName >= 0 ? (row[idxName] || '').toString().trim() : null
    const email = idxEmail >= 0 ? (row[idxEmail] || '').toString().trim().toLowerCase() : null
    if (!name && !email) continue
    rows.push({
      name: name || null,
      email: email || null,
      joinedAt: parseLooseDate(idxJoined >= 0 ? row[idxJoined] : null),
      leftAt: parseLooseDate(idxLeft >= 0 ? row[idxLeft] : null),
    })
  }
  return rows
}

function parseLooseDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !s.trim()) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Combined orchestration: scan for both signals and return whichever produces
 * the strongest evidence. Order of preference:
 *   1. Attendance sheet (true present/absent answer for both candidate + host)
 *   2. Gemini Notes (proves meeting happened, doesn't disambiguate attendees)
 *   3. Drive Recording (same as Gemini — happened, but not who)
 *
 * The caller decides whether to fire `meeting_started` only (signals 2/3) or
 * also `meeting_no_show` (signal 1, when candidate row is absent).
 */
export async function findAttendanceForMeeting(
  client: OAuth2Client,
  opts: {
    windowStart: Date
    windowEnd: Date
    folderId: string | null
    candidateName: string | null
    candidateEmail: string | null
    extensionEnabled: boolean
    sheetsScopeGranted: boolean
  },
): Promise<AttendanceSignal | null> {
  // 1. Attendance sheet — only when both the user has confirmed the extension
  //    is installed AND we have the sheets.readonly scope.
  if (opts.extensionEnabled && opts.sheetsScopeGranted) {
    const sheet = await findAttendanceSheetForMeeting(client, opts).catch(() => null)
    if (sheet) {
      let rows: AttendanceRow[] = []
      try { rows = await readAttendanceRows(client, sheet.id) }
      catch (err) { console.warn('[attendance] readAttendanceRows failed:', (err as Error).message) }
      const candidatePresent = isAttendeePresent(rows, opts.candidateName, opts.candidateEmail)
      return {
        source: 'attendance_sheet',
        driveFileId: sheet.id,
        fileName: sheet.name,
        createdAt: sheet.createdTime ? new Date(sheet.createdTime) : new Date(),
        parsedRows: rows,
        candidatePresent,
      }
    }
    // Extension is the source of truth for this workspace, but the sheet
    // hasn't landed in Drive yet. Return null so the caller emits nothing —
    // falling back to Gemini Notes / recording here is unsafe because they
    // can't tell us if the candidate was actually in the room (the host
    // alone produces both signals). The caller's re-sync loop will pick up
    // the sheet on a later pass.
    return null
  }

  // 2. Gemini Notes — strongest "happened" signal we get for free when the
  //    extension isn't enabled. Return ALL files via allFiles so the caller
  //    can archive every Notes doc it finds (multiple sessions on the same
  //    link produce multiple docs).
  const notes = await findGeminiNotesForMeeting(client, opts).catch(() => [] as DriveFile[])
  if (notes.length > 0) {
    const primary = notes[0]
    return {
      source: 'gemini_notes',
      driveFileId: primary.id,
      fileName: primary.name,
      createdAt: primary.createdTime ? new Date(primary.createdTime) : new Date(),
      allFiles: notes.map((f) => ({
        id: f.id,
        name: f.name,
        createdAt: f.createdTime ? new Date(f.createdTime) : new Date(),
      })),
    }
  }

  return null
}

/**
 * Parse a CSV (or TSV / pipe-delimited) blob exported from the attendance
 * Chrome extension or from Google Sheets (File → Download → CSV). Detects the
 * delimiter from the header row, looks up `name` / `email` / `joined` /
 * `left` / `duration` columns by header label rather than position so we
 * tolerate the schema variation between extensions.
 *
 * Trims + lowercases emails to match `isAttendeePresent`'s expectations.
 *
 * No PII beyond what we already need is retained: the returned rows hold
 * exactly the fields used for matching + actualStart/End derivation; the
 * raw CSV is discarded by the caller.
 */
export function parseAttendanceCsv(text: string): AttendanceRow[] {
  const trimmed = text.replace(/^﻿/, '').trim()  // strip BOM
  if (!trimmed) return []
  const lines = splitCsvLines(trimmed)
  if (lines.length < 2) return []

  const delim = detectDelimiter(lines[0])
  const header = splitCsvRow(lines[0], delim).map(h => h.trim().toLowerCase())
  const idxName = header.findIndex(h => h === 'name' || h === 'full name' || h === 'display name' || h === 'participant' || h === 'attendee')
  const idxEmail = header.findIndex(h => h === 'email' || h === 'email address' || h === 'e-mail')
  // Header matching is loose to handle "Joined", "Joined At", "Time Joined",
  // "Join Time", "Left", "Leave Time", etc. across extension variants.
  const idxJoined = header.findIndex(h => /\bjoin/i.test(h))
  const idxLeft = header.findIndex(h => /\b(left|leave|leaved)/i.test(h))
  // duration is parsed only to derive leftAt when it's missing but joinedAt + duration are present
  const idxDuration = header.findIndex(h => /duration|minutes/i.test(h))

  const rows: AttendanceRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvRow(lines[i], delim)
    if (cells.every(c => !c.trim())) continue
    const name = idxName >= 0 ? (cells[idxName] || '').toString().trim() : null
    const email = idxEmail >= 0 ? (cells[idxEmail] || '').toString().trim().toLowerCase() : null
    if (!name && !email) continue
    const joinedAt = idxJoined >= 0 ? parseLooseDate(cells[idxJoined]) : null
    let leftAt = idxLeft >= 0 ? parseLooseDate(cells[idxLeft]) : null
    if (!leftAt && joinedAt && idxDuration >= 0) {
      const minutes = parseLooseMinutes(cells[idxDuration])
      if (minutes != null) leftAt = new Date(joinedAt.getTime() + minutes * 60_000)
    }
    rows.push({ name: name || null, email: email || null, joinedAt, leftAt })
  }
  return rows
}

function detectDelimiter(headerLine: string): ',' | '\t' | ';' | '|' {
  const counts = { ',': 0, '\t': 0, ';': 0, '|': 0 } as Record<',' | '\t' | ';' | '|', number>
  for (const ch of headerLine) if (ch in counts) counts[ch as ',']++
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as ',' | '\t' | ';' | '|') || ','
}

/**
 * Split a CSV body into logical lines, respecting quoted newlines.
 *
 * Tracks quote state only to know whether a newline is a line break or part
 * of a quoted field; does NOT unescape `""` pairs here — that's
 * splitCsvRow's job. Two-pass parsing where one pass mutates makes the
 * second pass mis-quote.
 */
function splitCsvLines(text: string): string[] {
  const out: string[] = []
  let buf = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      // Doubled quote inside a quoted field stays as `""` in the line buffer
      // and gets unescaped during row splitting.
      if (inQuotes && text[i + 1] === '"') { buf += '""'; i++; continue }
      inQuotes = !inQuotes
      buf += ch
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (buf.length > 0) out.push(buf)
      buf = ''
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else {
      buf += ch
    }
  }
  if (buf.length > 0) out.push(buf)
  return out
}

/** Split a single CSV/TSV row into cells, unquoting quoted fields. */
function splitCsvRow(line: string, delim: string): string[] {
  const out: string[] = []
  let buf = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { buf += '"'; i++; continue }
      inQuotes = !inQuotes
    } else if (ch === delim && !inQuotes) {
      out.push(buf); buf = ''
    } else {
      buf += ch
    }
  }
  out.push(buf)
  return out
}

function parseLooseMinutes(s: unknown): number | null {
  if (s == null) return null
  const str = String(s).trim()
  if (!str) return null
  // Accept "12", "12.5", "12 min", "12:30" (= 12m30s → 12.5min), "1:23:45" (h:m:s)
  if (/^\d+(\.\d+)?$/.test(str)) return Number(str)
  const colon = str.split(':').map(p => p.trim())
  if (colon.length === 2 && colon.every(p => /^\d+$/.test(p))) return Number(colon[0]) + Number(colon[1]) / 60
  if (colon.length === 3 && colon.every(p => /^\d+$/.test(p))) return Number(colon[0]) * 60 + Number(colon[1]) + Number(colon[2]) / 60
  const m = str.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minutes?)/i)
  if (m) return Number(m[1])
  return null
}

/**
 * Returns true if any row in the attendance sheet matches the candidate by
 * email (preferred — exact, case-insensitive) or by name (looser substring
 * match either direction). Exported for unit testing.
 */
export function isAttendeePresent(
  rows: AttendanceRow[],
  candidateName: string | null,
  candidateEmail: string | null,
): boolean {
  if (rows.length === 0) return false
  const emailNeedle = candidateEmail?.toLowerCase().trim() || null
  const nameNeedle = candidateName?.toLowerCase().trim() || null
  for (const r of rows) {
    if (emailNeedle && r.email && r.email === emailNeedle) return true
    if (nameNeedle && r.name) {
      const n = r.name.toLowerCase()
      if (n.includes(nameNeedle) || nameNeedle.includes(n)) return true
    }
  }
  return false
}
