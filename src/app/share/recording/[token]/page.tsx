'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface SharedCapture {
  mode: string
  prompt: string | null
  mimeType: string | null
  durationSec: number | null
  playbackUrl: string
  playbackExpiresAt: string
}

function formatDuration(n: number | null | undefined): string | null {
  if (n == null) return null
  const m = Math.floor(n / 60)
  const s = Math.floor(n % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SharedRecordingPage() {
  const params = useParams()
  const token = params.token as string
  const [data, setData] = useState<SharedCapture | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/public/captures/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error('This share link is no longer valid.')
          if (res.status === 409) throw new Error('Recording is not ready yet — try again in a moment.')
          throw new Error(`Could not load recording (HTTP ${res.status}).`)
        }
        return res.json()
      })
      .then((d: SharedCapture) => {
        if (!cancelled) setData(d)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [token])

  const isVideo = data ? (data.mode === 'video' || data.mode === 'audio_video') : false

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-10">
      <div className="bg-white rounded-[12px] border border-surface-border shadow-sm w-full max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-grey-15 mb-1">Shared recording</h1>
        <p className="text-xs text-grey-40 mb-5">Sent to you by a HireFunnel recruiter.</p>

        {loading ? (
          <div className="text-sm text-grey-40 py-8 text-center">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-[8px] p-4">
            {error}
          </div>
        ) : data ? (
          <>
            {data.prompt ? (
              <p className="text-sm text-grey-35 mb-3 whitespace-pre-wrap">{data.prompt}</p>
            ) : null}

            {isVideo ? (
              <video
                src={data.playbackUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full rounded-[8px] bg-black"
              />
            ) : (
              <audio
                src={data.playbackUrl}
                controls
                preload="metadata"
                className="w-full"
              />
            )}

            <div className="flex items-center gap-2 mt-3 text-xs text-grey-40">
              {formatDuration(data.durationSec) ? (
                <span className="rounded-full bg-surface px-2 py-0.5">
                  {formatDuration(data.durationSec)}
                </span>
              ) : null}
              {data.mode !== 'audio' ? (
                <span className="rounded-full bg-surface px-2 py-0.5">{data.mode}</span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      <a href="https://www.hirefunnel.app" className="mt-6 text-xs text-grey-40 hover:text-grey-15">
        hirefunnel.app
      </a>
    </div>
  )
}
