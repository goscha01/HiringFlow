'use client'

import { useState, useEffect } from 'react'
import { uploadVideoFile } from '@/lib/upload-client'

interface Video {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  url: string
}

interface UploadProgress {
  filename: string
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [uploads, setUploads] = useState<UploadProgress[]>([])

  useEffect(() => {
    fetchVideos()
  }, [])

  const fetchVideos = async () => {
    const res = await fetch('/api/videos')
    if (res.ok) {
      const data = await res.json()
      setVideos(data)
    }
  }

  const deleteVideo = async (id: string) => {
    if (!confirm('Delete this video?')) return
    setVideos((prev) => prev.filter((v) => v.id !== id))
    await fetch(`/api/videos/${id}`, { method: 'DELETE' })
  }

  const uploadSingleFile = async (file: File, index: number): Promise<Video | null> => {
    try {
      setUploads((prev) =>
        prev.map((u, i) => (i === index ? { ...u, status: 'uploading' } : u))
      )

      const result = await uploadVideoFile(file, (progress) => {
        setUploads((prev) =>
          prev.map((u, i) => (i === index ? { ...u, progress, status: 'uploading' } : u))
        )
      })

      setUploads((prev) =>
        prev.map((u, i) => (i === index ? { ...u, progress: 100, status: 'success' } : u))
      )

      // Refresh video list to get the DB record with proper ID
      await fetchVideos()
      return result as unknown as Video
    } catch {
      setUploads((prev) =>
        prev.map((u, i) => (i === index ? { ...u, status: 'error', error: 'Upload failed' } : u))
      )
      return null
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setUploading(true)
    setError('')

    // Initialize upload progress for all files
    const initialProgress: UploadProgress[] = files.map((f) => ({
      filename: f.name,
      progress: 0,
      status: 'pending',
    }))
    setUploads(initialProgress)

    // Upload files sequentially to avoid overwhelming the server
    const uploadedVideos: Video[] = []
    for (let i = 0; i < files.length; i++) {
      const video = await uploadSingleFile(files[i], i)
      if (video) {
        uploadedVideos.push(video)
      }
    }

    // Add all successfully uploaded videos to the list
    if (uploadedVideos.length > 0) {
      setVideos((prev) => [...uploadedVideos, ...prev])
    }

    setUploading(false)
    e.target.value = ''

    // Clear upload progress after a delay
    setTimeout(() => {
      setUploads([])
    }, 3000)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Videos</h1>
        <label className="bg-brand-500 text-white px-4 py-2 rounded-md hover:bg-brand-600 cursor-pointer transition-colors">
          {uploading ? 'Uploading...' : 'Upload Videos'}
          <input
            type="file"
            accept="video/*"
            multiple
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Upload Progress */}
      {uploads.length > 0 && (
        <div className="mb-6 space-y-2">
          {uploads.map((upload, idx) => (
            <div key={idx} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="truncate font-medium text-gray-700">{upload.filename}</span>
                <span className="ml-2 text-gray-500">
                  {upload.status === 'success' && 'Done'}
                  {upload.status === 'error' && 'Failed'}
                  {upload.status === 'uploading' && `${upload.progress}%`}
                  {upload.status === 'pending' && 'Waiting...'}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    upload.status === 'error'
                      ? 'bg-red-500'
                      : upload.status === 'success'
                      ? 'bg-green-500'
                      : 'bg-brand-500'
                  }`}
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-md mb-4">
          {error}
        </div>
      )}

      {videos.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No videos uploaded yet. Upload your first video to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <div key={video.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="aspect-video bg-black">
                <video
                  src={video.url}
                  className="w-full h-full object-contain"
                  controls
                  preload="metadata"
                />
              </div>
              <div className="p-4">
                <h3 className="font-medium text-gray-900 truncate" title={video.filename}>
                  {(video as any).displayName || video.filename}
                </h3>
                {(video as any).summary && (
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">{(video as any).summary}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-gray-500">
                    {formatFileSize(video.sizeBytes)} &middot;{' '}
                    {new Date(video.createdAt).toLocaleDateString()}
                  </p>
                  <button
                    onClick={() => deleteVideo(video.id)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
