'use client'

// Top-level "Recordings" panel on the candidate detail page.
//
// Sits next to InterviewPanel + CurrentActivityCard — surfaces captures as
// a first-class candidate activity instead of hiding them behind the
// Captures tab. Renders an inline <audio>/<video> player per processed
// capture (using the signed playbackUrl minted server-side by
// /api/captures/session/[sessionId]).
//
// Self-hides when there's nothing to show:
//   - Still loading (don't flash an empty card)
//   - Zero captures
//   - Every capture is failed (rare; renders a single failed-state row
//     so the recruiter knows something went wrong instead of being
//     silently hidden)

interface CaptureRow {
  id: string
  stepId: string
  mode: string
  prompt: string | null
  status: string
  mimeType: string | null
  fileSizeBytes: number | null
  durationSec: number | null
  captureOrdinal: number
  playbackUrl: string | null
  errorMessage: string | null
  createdAt: string
}

interface CapturesPanelProps {
  captures: CaptureRow[] | null
  loading: boolean
}

function formatBytes(n: number | null | undefined): string | null {
  if (n == null) return null
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(n: number | null | undefined): string | null {
  if (n == null) return null
  const m = Math.floor(n / 60)
  const s = Math.floor(n % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function CapturesPanel({ captures, loading }: CapturesPanelProps) {
  // Self-hide rules — match the spirit of InterviewPanel which simply
  // doesn't render until there's something interesting to show.
  if (loading) return null
  if (!captures || captures.length === 0) return null

  // Show all captures in this panel. Failed rows still surface so the
  // recruiter knows a recording was attempted; the visible audio is only
  // mounted for rows that have a playable URL.
  return (
    <div className="bg-white rounded-[12px] border border-surface-border p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-grey-15">
          Recordings ({captures.length})
        </h3>
        <span className="text-xs text-grey-40">Audio answers from the candidate</span>
      </div>

      <div className="space-y-4">
        {captures.map((c) => {
          const isVideo = c.mode === 'video' || c.mode === 'audio_video'
          const meta: string[] = []
          if (c.captureOrdinal > 1) meta.push(`Take ${c.captureOrdinal}`)
          const dur = formatDuration(c.durationSec)
          if (dur) meta.push(dur)
          const size = formatBytes(c.fileSizeBytes)
          if (size) meta.push(size)
          if (c.mode !== 'audio') meta.push(c.mode)

          return (
            <div key={c.id} className="border-t border-surface-divider pt-4 first:border-0 first:pt-0">
              {c.prompt ? (
                <p className="text-sm text-grey-35 mb-2 whitespace-pre-wrap">{c.prompt}</p>
              ) : null}

              {c.playbackUrl ? (
                isVideo ? (
                  <video
                    src={c.playbackUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full max-w-lg rounded-[8px] bg-black"
                  />
                ) : (
                  <audio
                    src={c.playbackUrl}
                    controls
                    preload="metadata"
                    className="w-full max-w-lg"
                  />
                )
              ) : c.status === 'failed' ? (
                <div className="text-xs text-red-600">
                  Recording failed{c.errorMessage ? `: ${c.errorMessage}` : '.'}
                </div>
              ) : (
                <div className="text-xs text-grey-40">Recording not ready yet.</div>
              )}

              <div className="flex items-center gap-2 mt-2 text-xs text-grey-40">
                {meta.map((bit, i) => (
                  <span key={i} className="rounded-full bg-surface px-2 py-0.5">{bit}</span>
                ))}
                {c.status !== 'processed' ? (
                  <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5">
                    {c.status}
                  </span>
                ) : null}
                <span className="ml-auto text-grey-50">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
