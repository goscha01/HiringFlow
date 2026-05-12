'use client'

// Recruiter-side playback for a single CaptureResponse.
//
// Renders inline — the parent (candidate detail page → Captures tab) gets
// a short-lived signed playback URL from the list endpoint and passes it
// in via `playbackUrl`. Same UX as the legacy Submissions tab where
// candidate-uploaded videos render with a controls bar by default.
//
// Fallback: when the list call couldn't sign a URL for some reason (status
// not playable, signing error), the component shows a small "Try again"
// affordance that hits /api/captures/[id]/playback on click to re-mint.

import { useCallback, useState } from 'react'

interface CapturePlaybackProps {
  captureId: string
  mode: string
  status: string
  mimeType?: string | null
  durationSec?: number | null
  fileSizeBytes?: number | null
  captureOrdinal?: number
  // Pre-signed playback URL from the list endpoint. Null when the row isn't
  // in a playable state or the signing failed; the inline retry button
  // hits the per-capture playback endpoint to mint a fresh URL.
  playbackUrl?: string | null
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

export default function CapturePlayback(props: CapturePlaybackProps) {
  const { captureId, mode, status, mimeType, durationSec, fileSizeBytes, captureOrdinal, playbackUrl } = props
  // Lazy fallback: if `playbackUrl` is null at render time, the recruiter
  // can click "Try again" to re-mint via the per-capture playback endpoint.
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const [fallbackErr, setFallbackErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const effectiveUrl = playbackUrl || fallbackUrl
  const isVideoMode = mode === 'video' || mode === 'audio_video'

  const retry = useCallback(async () => {
    setLoading(true)
    setFallbackErr(null)
    try {
      const res = await fetch(`/api/captures/${captureId}/playback`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any))
        throw new Error(body?.error || `Playback failed (${res.status})`)
      }
      const data = (await res.json()) as { url: string }
      setFallbackUrl(data.url)
    } catch (err: any) {
      setFallbackErr(err?.message || 'Could not load playback URL')
    } finally {
      setLoading(false)
    }
  }, [captureId])

  const metaBits: string[] = []
  if (captureOrdinal && captureOrdinal > 1) metaBits.push(`Take ${captureOrdinal}`)
  const dur = formatDuration(durationSec)
  if (dur) metaBits.push(dur)
  const size = formatBytes(fileSizeBytes)
  if (size) metaBits.push(size)
  if (mode && mode !== 'audio') metaBits.push(mode)

  return (
    <div className="space-y-2">
      {effectiveUrl ? (
        isVideoMode ? (
          <video
            src={effectiveUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full max-w-lg rounded-[8px] bg-black"
          />
        ) : (
          <audio
            src={effectiveUrl}
            controls
            preload="metadata"
            className="w-full max-w-lg"
          />
        )
      ) : status === 'processed' || status === 'uploaded' || status === 'processing' ? (
        // Should have had a URL but didn't — show retry affordance.
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={retry}
            disabled={loading}
            className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Try again'}
          </button>
          {fallbackErr ? <span className="text-xs text-red-600">{fallbackErr}</span> : null}
        </div>
      ) : (
        <div className="text-xs text-grey-40">
          {status === 'failed' ? 'Recording failed.' : 'Recording not ready yet.'}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-grey-40">
        {metaBits.map((bit, i) => (
          <span key={i} className="rounded-full bg-surface px-2 py-0.5">{bit}</span>
        ))}
        {status !== 'processed' ? (
          <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5">
            {status}
          </span>
        ) : null}
      </div>
    </div>
  )
}
