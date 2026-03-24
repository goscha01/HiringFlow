'use client'

import { useState, useEffect } from 'react'

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

  const uploadSingleFile = async (file: File, index: number): Promise<Video | null> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('video', file)

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100)
          setUploads((prev) =>
            prev.map((u, i) => (i === index ? { ...u, progress, status: 'uploading' } : u))
          )
        }
      }

      xhr.onload = () => {
        if (xhr.status === 200) {
          const video = JSON.parse(xhr.responseText)
          setUploads((prev) =>
            prev.map((u, i) => (i === index ? { ...u, progress: 100, status: 'success' } : u))
          )
          resolve(video)
        } else {
          setUploads((prev) =>
            prev.map((u, i) => (i === index ? { ...u, status: 'error', error: 'Upload failed' } : u))
          )
          resolve(null)
        }
      }

      xhr.onerror = () => {
        setUploads((prev) =>
          prev.map((u, i) => (i === index ? { ...u, status: 'error', error: 'Upload failed' } : u))
        )
        resolve(null)
      }

      xhr.open('POST', '/api/videos')
      xhr.send(formData)
    })
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
        <label className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
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
                      : 'bg-blue-600'
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
                  {video.filename}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {formatFileSize(video.sizeBytes)} &middot;{' '}
                  {new Date(video.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
