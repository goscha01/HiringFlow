'use client'

// Recruiter-side playback for a single CaptureResponse. Mints a fresh
// short-lived signed S3 URL on every Play click — never caches the URL.
// Renders an <audio> element for audio captures and a <video> element for
// video / audio_video; falls back to a download link for other modes if
// they ever appear (Phase 1B only ships audio in the candidate UI but the
// recruiter view stays mode-aware).

import { useCallback, useState } from 'react'

interface CapturePlaybackProps {
  captureId: string
  mode: string
  status: string
  mimeType?: string | null
  durationSec?: number | null
  fileSizeBytes?: number | null
  captureOrdinal?: number
}

type PlayState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; url: string; mimeType: string | null; expiresAt: string }
  | { kind: 'error'; message: string }

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
  const { captureId, mode, status, mimeType, durationSec, fileSizeBytes, captureOrdinal } = props
  const [play, setPlay] = useState<PlayState>({ kind: 'idle' })

  const fetchSigned = useCallback(async () => {
    setPlay({ kind: 'loading' })
    try {
      const res = await fetch(`/api/captures/${captureId}/playback`, {
        // Recruiter session cookie is enough; same-origin request.
        credentials: 'same-origin',
        // Don't cache — we want a fresh URL each click.
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any))
        throw new Error(body?.error || `Playback failed (${res.status})`)
      }
      const data = (await res.json()) as { url: string; mimeType: string | null; expiresAt: string }
      setPlay({ kind: 'ready', url: data.url, mimeType: data.mimeType, expiresAt: data.expiresAt })
    } catch (err: any) {
      setPlay({ kind: 'error', message: err?.message || 'Could not load playback URL' })
    }
  }, [captureId])

  const ready = play.kind === 'ready'
  const isVideoMode = mode === 'video' || mode === 'audio_video'

  const metaBits: string[] = []
  if (captureOrdinal && captureOrdinal > 1) metaBits.push(`Take ${captureOrdinal}`)
  const dur = formatDuration(durationSec)
  if (dur) metaBits.push(dur)
  const size = formatBytes(fileSizeBytes)
  if (size) metaBits.push(size)
  if (mode && mode !== 'audio') metaBits.push(mode)

  return (
    <div className="space-y-2">
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

      {!ready && status !== 'processed' && status !== 'uploaded' ? (
        <div className="text-xs text-grey-40">
          {status === 'failed'
            ? 'Recording failed.'
            : 'Recording not ready yet.'}
        </div>
      ) : !ready ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchSigned}
            disabled={play.kind === 'loading'}
            className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-50"
          >
            {play.kind === 'loading' ? 'Loading…' : 'Load playback'}
          </button>
          {play.kind === 'error' ? (
            <span className="text-xs text-red-600">{play.message}</span>
          ) : null}
        </div>
      ) : isVideoMode ? (
        <video
          src={play.url}
          controls
          playsInline
          className="w-full max-w-lg rounded-[8px] bg-black"
        />
      ) : (
        <audio
          src={play.url}
          controls
          className="w-full max-w-lg"
        />
      )}
    </div>
  )
}
