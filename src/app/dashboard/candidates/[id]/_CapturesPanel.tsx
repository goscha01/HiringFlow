'use client'

import { useState } from 'react'

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
  shareToken?: string | null
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

function buildShareUrl(token: string): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/share/recording/${token}`
}

export function CapturesPanel({ captures, loading }: CapturesPanelProps) {
  // Per-row share state lives here (not in parent) — share is a recording
  // concern, not a candidate-page concern. Keyed by captureId.
  const [shareState, setShareState] = useState<Record<string, { token: string | null; busy: boolean; copied?: boolean; error?: string }>>({})

  // Self-hide rules — match the spirit of InterviewPanel which simply
  // doesn't render until there's something interesting to show.
  if (loading) return null
  if (!captures || captures.length === 0) return null

  const getTokenFor = (c: CaptureRow): string | null => {
    const local = shareState[c.id]
    if (local && local.token !== undefined) return local.token
    return c.shareToken ?? null
  }

  const createOrCopy = async (c: CaptureRow) => {
    const existing = getTokenFor(c)
    if (existing) {
      try {
        await navigator.clipboard.writeText(buildShareUrl(existing))
        setShareState((s) => ({ ...s, [c.id]: { ...(s[c.id] ?? { token: existing, busy: false }), copied: true } }))
        setTimeout(() => {
          setShareState((s) => {
            const cur = s[c.id]
            if (!cur) return s
            return { ...s, [c.id]: { ...cur, copied: false } }
          })
        }, 2000)
      } catch {
        setShareState((s) => ({ ...s, [c.id]: { token: existing, busy: false, error: 'Copy failed — link is in the share box below.' } }))
      }
      return
    }
    setShareState((s) => ({ ...s, [c.id]: { token: null, busy: true } }))
    try {
      const res = await fetch(`/api/captures/${c.id}/share`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setShareState((s) => ({ ...s, [c.id]: { token: null, busy: false, error: data?.error || `Failed (HTTP ${res.status})` } }))
        return
      }
      const token: string = data.shareToken
      try {
        await navigator.clipboard.writeText(buildShareUrl(token))
        setShareState((s) => ({ ...s, [c.id]: { token, busy: false, copied: true } }))
        setTimeout(() => {
          setShareState((s) => {
            const cur = s[c.id]
            if (!cur) return s
            return { ...s, [c.id]: { ...cur, copied: false } }
          })
        }, 2000)
      } catch {
        setShareState((s) => ({ ...s, [c.id]: { token, busy: false } }))
      }
    } catch (err) {
      setShareState((s) => ({ ...s, [c.id]: { token: null, busy: false, error: err instanceof Error ? err.message : 'Failed' } }))
    }
  }

  const revoke = async (c: CaptureRow) => {
    if (!confirm('Revoke this share link? Anyone with the link will no longer be able to view the recording.')) return
    setShareState((s) => ({ ...s, [c.id]: { ...(s[c.id] ?? { token: c.shareToken ?? null, busy: false }), busy: true } }))
    try {
      const res = await fetch(`/api/captures/${c.id}/share`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setShareState((s) => ({ ...s, [c.id]: { token: c.shareToken ?? null, busy: false, error: data?.error || `Failed (HTTP ${res.status})` } }))
        return
      }
      setShareState((s) => ({ ...s, [c.id]: { token: null, busy: false } }))
    } catch (err) {
      setShareState((s) => ({ ...s, [c.id]: { token: c.shareToken ?? null, busy: false, error: err instanceof Error ? err.message : 'Failed' } }))
    }
  }

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

          const shareToken = getTokenFor(c)
          const shareUrl = shareToken ? buildShareUrl(shareToken) : null
          const localShare = shareState[c.id]
          const canShare = c.playbackUrl != null

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
                {canShare ? (
                  <button
                    onClick={() => createOrCopy(c)}
                    disabled={localShare?.busy}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-surface-border text-grey-35 hover:border-grey-35 hover:text-grey-15 disabled:opacity-50"
                    title={shareToken ? 'Copy public share link' : 'Create a public share link'}
                  >
                    {localShare?.busy
                      ? 'Working…'
                      : localShare?.copied
                        ? 'Copied!'
                        : shareToken
                          ? 'Copy link'
                          : 'Share'}
                  </button>
                ) : null}
                {shareToken ? (
                  <button
                    onClick={() => revoke(c)}
                    disabled={localShare?.busy}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-grey-40 hover:text-red-700 disabled:opacity-50"
                    title="Revoke the share link"
                  >
                    Unshare
                  </button>
                ) : null}
                <span className={canShare || shareToken ? 'text-grey-50' : 'ml-auto text-grey-50'}>
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>

              {shareUrl ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded-[6px] border border-surface-border bg-surface text-grey-35 font-mono"
                  />
                </div>
              ) : null}

              {localShare?.error ? (
                <div className="mt-1 text-[11px] text-red-600">{localShare.error}</div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
