/**
 * POST /api/interview-meetings/[id]/attendance-upload
 *
 * Manual attendance import for personal-Gmail / Workspace Individual tenants
 * whose Chrome attendance extension exports to local Downloads (or to a
 * Drive account we can't read), or any time the recruiter wants to feed
 * attendance into HireFunnel by hand.
 *
 * Accepts multipart/form-data with a single `file` field. The file body is
 * decoded as text and run through `parseAttendanceCsv`, which handles plain
 * CSV, TSV, semicolon/pipe delimiters, BOM, and Google Sheets's
 * "File → Download → CSV" output. Any column header variation is tolerated;
 * only `name` and/or `email` are required for matching.
 *
 * After parsing, runs the same `applyAttendanceSignal` pipeline the
 * sync-on-read fallback uses — this keeps the lifecycle-event semantics
 * (idempotent meeting_started/ended; meeting_no_show on absent candidate)
 * exactly identical between the two ingestion paths.
 *
 * PII: we do not persist the raw uploaded file or any unmatched attendee
 * rows. We persist only:
 *   - InterviewMeeting.attendanceSheetFileId = "manual:<short id>" marker
 *   - SchedulingEvent metadata.fileName + uploadedAt + rowCount + candidatePresent
 * The parsed rows live only in memory for the duration of the request.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSchedulingEvent } from '@/lib/scheduling'
import { applyAttendanceSignal } from '@/lib/meet/sync-on-read'
import { parseAttendanceCsv, isAttendeePresent, type AttendanceRow } from '@/lib/meet/attendance-fallback'

const MAX_BYTES = 1_000_000  // 1 MB — attendance sheets are tiny; reject anything that looks abusive

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const meeting = await prisma.interviewMeeting.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    select: {
      id: true, workspaceId: true, sessionId: true,
      meetSpaceName: true,
      scheduledStart: true, scheduledEnd: true,
      actualStart: true, actualEnd: true,
      driveGeminiNotesFileId: true, attendanceSheetFileId: true,
    },
  })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get('file')
    if (f instanceof File) file = f
  } catch (err) {
    return NextResponse.json({ error: 'multipart_parse_failed', message: (err as Error).message }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'file_required', message: 'Upload a CSV or sheet export under the `file` field' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'file_too_large', message: `Max ${MAX_BYTES} bytes` }, { status: 400 })

  // Decode + parse. We accept anything text-shaped: CSV, TSV, semicolon, pipe.
  // .xlsx (binary) is intentionally NOT supported here — recruiters can use
  // Google Sheets's "Download → Comma-separated values" or Excel's "Save as
  // CSV" first. Adding xlsx parsing would pull in a heavy dep for a workflow
  // that's already one extra menu click.
  const text = await file.text()
  const rows = parseAttendanceCsv(text)
  if (rows.length === 0) {
    return NextResponse.json({
      error: 'no_rows_parsed',
      message: 'No usable attendance rows were found in the uploaded file. The file should have a header row including a name or email column.',
    }, { status: 422 })
  }

  // Match candidate against the rows.
  const session = await prisma.session.findUnique({
    where: { id: meeting.sessionId },
    select: { candidateName: true, candidateEmail: true },
  })
  const candidatePresent = isAttendeePresent(rows, session?.candidateName ?? null, session?.candidateEmail ?? null)

  // Pick the latest `leftAt` we see among present rows as the meeting end time
  // — that's a tighter bound than scheduledEnd. Falls back to scheduledEnd.
  const latestLeftAt = rows
    .map((r: AttendanceRow) => r.leftAt?.getTime())
    .filter((t): t is number => typeof t === 'number')
    .reduce<number | null>((best, t) => (best == null || t > best ? t : best), null)
  const inferredEnd = latestLeftAt ? new Date(latestLeftAt) : null

  const fileMarker = `manual:${randomUUID().slice(0, 8)}`
  const uploadedAt = new Date()

  // Audit row — captures the upload itself (separate from the lifecycle events
  // applyAttendanceSignal will emit). Stores filename + counts only; no PII
  // beyond what's needed for traceability.
  await logSchedulingEvent({
    sessionId: meeting.sessionId,
    eventType: 'attendance_uploaded',
    metadata: {
      interviewMeetingId: meeting.id,
      fileName: file.name,
      fileMarker,
      uploadedAt: uploadedAt.toISOString(),
      uploadedBy: ws.userId,
      rowCount: rows.length,
      candidatePresent,
    },
  })

  // Reuse the fallback pipeline so manual + Drive-detected uploads share
  // identical downstream semantics (idempotent meeting_started/ended; no-show
  // routing through the existing maybeFlagNoShow path).
  const fired = await applyAttendanceSignal(meeting, {
    source: 'attendance_sheet',
    driveFileId: fileMarker,
    fileName: file.name,
    createdAt: inferredEnd ?? meeting.scheduledEnd ?? uploadedAt,
    parsedRows: rows,
    candidatePresent,
  }, { recordingFileId: null, createdAt: null })

  return NextResponse.json({
    ok: true,
    rowCount: rows.length,
    candidatePresent,
    lifecycleFired: fired,
    inferredEnd: (inferredEnd ?? meeting.scheduledEnd)?.toISOString() ?? null,
  })
}
