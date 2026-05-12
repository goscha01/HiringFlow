// Capture Engine — minimal structured logger.
//
// Phase 1C ships structured console events with a stable shape so a future
// analytics or APM integration can pick them up without changing call sites.
// Server-side calls land in Vercel function logs and (when LOGHUB_URL is set)
// in Grafana Loki under service_name="hiringflow". Client-side calls land in
// the browser console for QA.

export type CaptureEvent =
  | 'capture_recording_started'
  | 'capture_recording_stopped'
  | 'capture_recording_aborted'
  | 'capture_permission_denied'
  | 'capture_upload_started'
  | 'capture_upload_progress'
  | 'capture_upload_completed'
  | 'capture_upload_failed'
  | 'capture_finalize_started'
  | 'capture_finalize_completed'
  | 'capture_finalize_failed'
  | 'capture_playback_signed'
  | 'capture_playback_failed'

interface CaptureLogPayload {
  event: CaptureEvent
  ts: string
  // Caller-supplied identifiers — only include what's known at the call site.
  sessionId?: string
  stepId?: string
  captureId?: string
  workspaceId?: string
  mode?: string
  mimeType?: string
  durationSec?: number
  sizeBytes?: number
  pct?: number
  reason?: string
  errorCode?: string
  statusCode?: number
  // Anything else the call site wants to surface; merged in.
  [key: string]: unknown
}

const SIDE: 'client' | 'server' = typeof window === 'undefined' ? 'server' : 'client'

export function captureLog(event: CaptureEvent, fields: Omit<CaptureLogPayload, 'event' | 'ts'> = {}) {
  const payload: CaptureLogPayload = {
    event,
    ts: new Date().toISOString(),
    ...fields,
  }
  // Single-line JSON for easy ingestion. The `[capture]` prefix makes it
  // greppable in raw logs without parsing.
  const line = `[capture] ${JSON.stringify(payload)}`
  // Errors go to console.error so log shippers (Vercel → LogHub) tag them as
  // error level; everything else is info.
  if (event.endsWith('_failed') || event.endsWith('_denied') || event.endsWith('_aborted')) {
    console.error(line)
  } else {
    console.info(line)
  }
  // Side discriminator is debug-only; not part of the payload to keep the
  // shape stable. Reachable via `(globalThis as any).__captureLogSide` in tests.
  ;(globalThis as any).__captureLogSide = SIDE
}
