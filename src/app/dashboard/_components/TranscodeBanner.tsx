'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUploads } from './UploadProvider'

// Global banner shown on every dashboard route. Two slices of state:
//   1. Live PUT-to-R2 uploads in progress — read from the UploadProvider so
//      navigating to a different tab keeps the banner showing progress.
//      Uploads survive across the dashboard SPA (provider mounted at layout
//      level); the banner is how the recruiter sees that progress when not
//      on /dashboard/videos.
//   2. Videos that have finished uploading and are still transcoding — polled
//      from the DB every 15 s. Hides itself when nothing's pending.
//
// Dismissable per session; re-appears on refresh.

interface PendingVideo { id: string; filename: string; displayName?: string | null; status: string }

export function TranscodeBanner() {
  const { uploads: liveUploads, inFlightCount } = useUploads()
  const [transcoding, setTranscoding] = useState<PendingVideo[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/videos')
        if (!res.ok) return
        const all = await res.json() as PendingVideo[]
        const pending = all.filter((v) => v.status === 'transcoding')
        if (!cancelled) setTranscoding(pending)
      } catch { /* swallow */ }
    }
    load()
    const id = setInterval(load, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Re-show the banner once a new upload kicks off, even if the recruiter
  // dismissed an earlier session of it.
  useEffect(() => { if (inFlightCount > 0) setDismissed(false) }, [inFlightCount])

  if (dismissed) return null
  if (inFlightCount === 0 && transcoding.length === 0) return null

  // Pick the most useful primary line: live upload > transcoding queue.
  let primary: React.ReactNode
  if (inFlightCount > 0) {
    const inFlight = liveUploads.filter((u) => u.status === 'pending' || u.status === 'uploading')
    const avgPct = Math.round(inFlight.reduce((a, u) => a + u.progress, 0) / inFlight.length)
    primary = (
      <>
        <strong className="text-ink">Uploading {inFlight.length} video{inFlight.length === 1 ? '' : 's'}</strong>
        <span className="text-grey-35"> · {avgPct}% — keep the browser open, you can switch tabs. </span>
      </>
    )
  } else {
    primary = (
      <>
        <strong className="text-ink">{transcoding.length} video{transcoding.length === 1 ? '' : 's'} transcoding</strong>
        <span className="text-grey-35"> — you&apos;ll get an email when {transcoding.length === 1 ? "it's" : 'each one is'} ready. </span>
      </>
    )
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[12px] border-b"
      style={{ background: '#FFF7EA', borderColor: '#FFE2B7' }}
    >
      <div className="w-5 h-5 border-2 border-[#FF9500] border-t-transparent rounded-full animate-spin flex-none" />
      <span className="flex-1 truncate">
        {primary}
        <Link href="/dashboard/videos" className="text-[#FF9500] hover:underline">View status</Link>
      </span>
      {inFlightCount === 0 && (
        // Only allow dismissal of the transcoding banner — uploads aren't
        // dismissable because closing the tab kills the PUT and we want that
        // dialog ever-present until the upload reaches 100%.
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex-none w-6 h-6 rounded hover:bg-black/5 flex items-center justify-center text-grey-35"
          title="Dismiss"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" /></svg>
        </button>
      )}
    </div>
  )
}
