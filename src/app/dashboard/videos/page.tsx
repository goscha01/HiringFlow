/**
 * Videos library — refreshed 3-column grid matching
 * Design/design_handoff_hirefunnel screens-part2. Dark gradient thumb with
 * play overlay and duration pill, filename in mono, delete on hover.
 */

'use client'

import { useState, useEffect } from 'react'
import { uploadVideoFile } from '@/lib/upload-client'
import { SubNav } from '../_components/SubNav'
import { Badge, Button, Card, Eyebrow, PageHeader } from '@/components/design'

const ASSETS_NAV = [
  { href: '/dashboard/content', label: 'Templates' },
  { href: '/dashboard/videos', label: 'Media' },
]

interface Video {
  id: string
  filename: string
  displayName?: string
  summary?: string
  mimeType: string
  sizeBytes: number
  durationSeconds?: number | null
  createdAt: string
  url: string
}

interface UploadProgress {
  filename: string
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

function fmtFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
function fmtDuration(s?: number | null) {
  if (!s || !isFinite(s)) return null
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploads, setUploads] = useState<UploadProgress[]>([])
  const [playing, setPlaying] = useState<string | null>(null)

  useEffect(() => { fetchVideos() }, [])

  const fetchVideos = async () => {
    const res = await fetch('/api/videos')
    if (res.ok) setVideos(await res.json())
  }

  const deleteVideo = async (id: string) => {
    if (!confirm('Delete this video?')) return
    setVideos((prev) => prev.filter((v) => v.id !== id))
    await fetch(`/api/videos/${id}`, { method: 'DELETE' })
  }

  const uploadSingleFile = async (file: File, index: number): Promise<Video | null> => {
    try {
      setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, status: 'uploading' } : u)))
      const result = await uploadVideoFile(file, (progress) => {
        setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, progress, status: 'uploading' } : u)))
      })
      setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, progress: 100, status: 'success' } : u)))
      await fetchVideos()
      return result as unknown as Video
    } catch {
      setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, status: 'error', error: 'Upload failed' } : u)))
      return null
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    const initial: UploadProgress[] = files.map((f) => ({ filename: f.name, progress: 0, status: 'pending' }))
    setUploads(initial)
    const uploaded: Video[] = []
    for (let i = 0; i < files.length; i++) {
      const v = await uploadSingleFile(files[i], i)
      if (v) uploaded.push(v)
    }
    if (uploaded.length > 0) setVideos((prev) => [...uploaded, ...prev])
    setUploading(false)
    e.target.value = ''
    setTimeout(() => setUploads([]), 3000)
  }

  return (
    <div className="-mx-6 lg:-mx-[132px]">
      <PageHeader
        eyebrow={`${videos.length} video${videos.length === 1 ? '' : 's'}`}
        title="Assets"
        description="Reusable templates and media for your flows and campaigns."
        actions={
          <label className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[10px] text-white font-semibold text-[13px] cursor-pointer" style={{ background: 'var(--brand-primary)' }}>
            {uploading ? 'Uploading…' : '+ Upload video'}
            <input type="file" accept="video/*" multiple onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
        }
      />

      <div className="px-8 pt-5">
        <SubNav items={ASSETS_NAV} />
      </div>

      <div className="px-8 py-4">
        {/* Upload Progress */}
        {uploads.length > 0 && (
          <div className="mb-5 space-y-2">
            {uploads.map((u, idx) => (
              <Card key={idx} padding={12}>
                <div className="flex justify-between text-[12px] mb-1.5">
                  <span className="truncate font-medium text-ink">{u.filename}</span>
                  <span className="ml-2 font-mono text-grey-35">
                    {u.status === 'success' && 'Done'}
                    {u.status === 'error' && 'Failed'}
                    {u.status === 'uploading' && `${u.progress}%`}
                    {u.status === 'pending' && 'Waiting…'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--weak-track)' }}>
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${u.progress}%`,
                      background:
                        u.status === 'error' ? 'var(--danger-fg)' :
                        u.status === 'success' ? 'var(--success-fg)' :
                        'var(--brand-primary)',
                    }}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}

        {videos.length === 0 ? (
          <Card padding={48} className="text-center">
            <Eyebrow size="xs" className="mb-2">Nothing yet</Eyebrow>
            <h2 className="text-[18px] font-semibold text-ink mb-1.5">No videos uploaded</h2>
            <p className="text-grey-35 text-[13px]">Upload your first video to start building flows.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {videos.map((v) => {
              const duration = fmtDuration(v.durationSeconds)
              const isPlaying = playing === v.id
              return (
                <Card key={v.id} padding={0} className="overflow-hidden group">
                  <div
                    className="aspect-video relative cursor-pointer"
                    style={{
                      background: isPlaying ? '#000' : 'linear-gradient(135deg, #2a2826 0%, #1a1815 100%)',
                    }}
                    onClick={() => setPlaying(isPlaying ? null : v.id)}
                  >
                    {isPlaying ? (
                      <video src={v.url} className="w-full h-full object-contain" controls autoPlay />
                    ) : (
                      <>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-sm transition-transform group-hover:scale-110" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}>
                            <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        </div>
                        {duration && (
                          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-[4px] font-mono text-[10px] text-white" style={{ background: 'rgba(0,0,0,0.6)', letterSpacing: '0.04em' }}>
                            {duration}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="p-3.5">
                    <div className="font-mono text-[11px] text-ink truncate mb-1" title={v.filename} style={{ letterSpacing: '0.02em' }}>
                      {v.displayName || v.filename}
                    </div>
                    {v.summary && (
                      <p className="text-[11px] text-grey-35 line-clamp-2 mb-2">{v.summary}</p>
                    )}
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-grey-35">
                        {fmtFileSize(v.sizeBytes)} · {new Date(v.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => deleteVideo(v.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[color:var(--danger-fg)] hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
