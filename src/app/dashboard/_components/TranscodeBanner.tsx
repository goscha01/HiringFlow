'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Global banner showing how many videos in the current workspace are still
// transcoding. Appears on every dashboard route (mounted in layout.tsx).
// Polls every 15 s while there's work in flight, stops polling otherwise so
// idle dashboards don't burn DB cycles.
//
// Dismissable per-session via the X button; re-appears on the next refresh
// or on a route change. Polling is cheap (single COUNT-ish query in
// /api/videos), so this won't add meaningful load.

interface PendingSummary {
  count: number
  videos: Array<{ id: string; filename: string; displayName?: string | null; status: string }>
}

export function TranscodeBanner() {
  const [summary, setSummary] = useState<PendingSummary>({ count: 0, videos: [] })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/videos?status=pending')
        if (!res.ok) return
        const all = await res.json() as Array<{ id: string; filename: string; displayName?: string | null; status: string }>
        const pending = all.filter((v) => v.status === 'transcoding' || v.status === 'uploading')
        if (!cancelled) setSummary({ count: pending.length, videos: pending })
      } catch { /* swallow; banner just stays the same */ }
    }
    load()
    const id = setInterval(load, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (dismissed || summary.count === 0) return null

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[12px] border-b"
      style={{ background: '#FFF7EA', borderColor: '#FFE2B7' }}
    >
      <div className="w-5 h-5 border-2 border-[#FF9500] border-t-transparent rounded-full animate-spin flex-none" />
      <span className="flex-1 truncate">
        <strong className="text-ink">{summary.count} video{summary.count === 1 ? '' : 's'} transcoding</strong>
        <span className="text-grey-35"> — you&apos;ll get an email when {summary.count === 1 ? 'it&apos;s' : 'each one is'} ready. </span>
        <Link href="/dashboard/videos" className="text-[#FF9500] hover:underline">View status</Link>
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="flex-none w-6 h-6 rounded hover:bg-black/5 flex items-center justify-center text-grey-35"
        title="Dismiss"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" /></svg>
      </button>
    </div>
  )
}
