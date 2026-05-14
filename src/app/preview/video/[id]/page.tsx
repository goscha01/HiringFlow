'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface PreviewData {
  id: string
  filename: string
  displayName: string | null
  durationSeconds: number | null
  sizeBytes: number | null
  hlsManifestUrl: string | null
  posterUrl: string | null
  sourceUrl: string
}

function fmtDuration(s: number | null): string | null {
  if (!s || !isFinite(s)) return null
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
function fmtSize(b: number | null): string | null {
  if (!b) return null
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

// Public preview page. Anyone with the videoId can view — same trust model
// as the existing /share/recording/[token] flow. The URL is intended to be
// pasted by recruiters into an email or Slack to QA a transcoded training
// video without first having to attach it to a flow.
export default function VideoPreviewPage() {
  const params = useParams()
  const videoId = params.id as string
  const [data, setData] = useState<PreviewData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!videoId) return
    let cancelled = false
    fetch(`/api/public/videos/${videoId}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error('This video link is no longer valid.')
          if (res.status === 409) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.status === 'transcoding' || body.status === 'uploading' ? 'Video is still processing — try again in a minute.' : 'Video is not ready.')
          }
          throw new Error(`Couldn't load video (HTTP ${res.status}).`)
        }
        return res.json()
      })
      .then((d: PreviewData) => { if (!cancelled) setData(d) })
      .catch((e: Error) => { if (!cancelled) setErr(e.message) })
    return () => { cancelled = true }
  }, [videoId])

  // Attach hls.js when we have a manifest. Safari plays HLS natively; for
  // everything else we dynamically import hls.js and let it drive the
  // <video> element via MediaSource Extensions. Falls back to the source
  // MP4 (set via the `src` prop directly) for legacy Vercel Blob videos
  // where hlsManifestUrl is null.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !data?.hlsManifestUrl) return
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = data.hlsManifestUrl
      return
    }
    let cancelled = false
    let hls: { destroy: () => void } | null = null
    import('hls.js').then((mod) => {
      const Hls = mod.default
      if (cancelled || !Hls.isSupported()) return
      const instance = new Hls({ startLevel: 1, maxBufferLength: 60 })
      instance.loadSource(data.hlsManifestUrl!)
      instance.attachMedia(v)
      hls = instance
    }).catch(() => {})
    return () => { cancelled = true; if (hls) hls.destroy() }
  }, [data?.hlsManifestUrl])

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#F7F7F8]">
        <div className="bg-white rounded-[12px] border border-[#F1F1F3] p-8 max-w-md text-center">
          <h1 className="text-[18px] font-semibold text-[#262626] mb-2">Can&apos;t play this video</h1>
          <p className="text-[13px] text-[#59595A]">{err}</p>
        </div>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]">
        <div className="w-8 h-8 border-3 border-[#FF9500] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const title = data.displayName || data.filename
  const duration = fmtDuration(data.durationSeconds)
  const size = fmtSize(data.sizeBytes)

  return (
    <div className="min-h-screen bg-[#F7F7F8] flex flex-col items-center px-4 py-8">
      <div className="bg-white rounded-[12px] border border-[#F1F1F3] w-full max-w-3xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="aspect-video bg-black">
          <video
            ref={videoRef}
            {...(data.hlsManifestUrl ? {} : { src: data.sourceUrl })}
            poster={data.posterUrl || undefined}
            className="w-full h-full object-contain"
            controls
            playsInline
          />
        </div>
        <div className="p-5">
          <h1 className="text-[18px] font-semibold text-[#262626] mb-1 truncate" title={title}>{title}</h1>
          <p className="text-[12px] text-[#59595A] font-mono">
            {[duration, size].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <p className="mt-5 text-[11px] text-[#59595A] font-mono uppercase" style={{ letterSpacing: '0.08em' }}>HireFunnel · shared video</p>
    </div>
  )
}
