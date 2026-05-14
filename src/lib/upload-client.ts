const IS_VERCEL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'

interface UploadResult {
  id?: string
  url: string
  storageKey: string
  filename: string
  mimeType: string
  sizeBytes: number
  status?: string
}

// Trigger video analysis (transcription + AI summary) after upload. With the
// R2/HLS pipeline analysis fires automatically when the transcode-complete
// webhook lands, so this is now a no-op for new uploads — but legacy callers
// (and the local-dev path that doesn't go through R2) still rely on it.
export function triggerVideoAnalysis(
  videoId: string,
  onComplete?: (result: any) => void,
  onError?: (error: string) => void
) {
  fetch(`/api/videos/${videoId}/analyze`, { method: 'POST' })
    .then(async (res) => {
      if (res.ok) {
        const data = await res.json()
        if (onComplete) onComplete(data)
      } else {
        const err = await res.json().catch(() => ({ error: 'Analysis failed' }))
        if (onError) onError(err.error || 'Analysis failed')
      }
    })
    .catch(() => { if (onError) onError('Network error during analysis') })
}

export type VideoKind = 'interview' | 'training'

export async function uploadVideoFile(
  file: File,
  onProgress?: (percent: number) => void,
  kind: VideoKind = 'training'
): Promise<UploadResult> {
  if (IS_VERCEL) {
    return uploadViaR2(file, onProgress, kind)
  }
  return uploadViaApi(file, onProgress, kind)
}

// Production (R2/HLS pipeline). Three-step flow:
//   1. POST /api/videos/upload-init — creates a Video row in status='uploading'
//      and returns a presigned R2 PUT URL pointing at the staging bucket.
//   2. xhr PUT the file directly to that URL (no bytes through Vercel).
//   3. POST /api/videos/{videoId}/finalize — flips status='transcoding' and
//      enqueues the Lambda transcode job. Server-side webhook flips to 'ready'
//      with the HLS manifest URL when transcoding finishes (~3-5 min later).
async function uploadViaR2(
  file: File,
  onProgress?: (percent: number) => void,
  kind: VideoKind = 'training'
): Promise<UploadResult> {
  onProgress?.(2)

  const initRes = await fetch('/api/videos/upload-init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || 'video/mp4',
      sizeBytes: file.size,
      kind,
    }),
  })
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}))
    throw new Error(err?.detail || err?.error || 'Failed to initiate upload')
  }
  const { videoId, presignedPutUrl, expectedContentType } = await initRes.json()

  // The Content-Type on the PUT MUST match the type we signed with — R2's
  // signature check will otherwise reject the upload with a 403.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        // Reserve the last 5% for the finalize call.
        onProgress(Math.round(5 + (event.loaded / event.total) * 90))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`R2 upload failed: ${xhr.status} ${xhr.responseText?.slice(0, 200) || ''}`))
    }
    xhr.onerror = () => reject(new Error('Upload network error'))
    xhr.open('PUT', presignedPutUrl)
    xhr.setRequestHeader('Content-Type', expectedContentType || file.type || 'video/mp4')
    xhr.send(file)
  })

  onProgress?.(97)

  const finalRes = await fetch(`/api/videos/${videoId}/finalize`, { method: 'POST' })
  if (!finalRes.ok) {
    const err = await finalRes.json().catch(() => ({}))
    throw new Error(err?.detail || err?.error || 'Failed to finalize upload')
  }

  onProgress?.(100)

  return {
    id: videoId,
    // storageKey points at the final original.mp4 URL once transcode finishes.
    // Callers should poll GET /api/videos/{id} until status==='ready' before
    // attempting playback or analysis on the returned URL.
    url: '',
    storageKey: '',
    filename: file.name,
    mimeType: file.type || 'video/mp4',
    sizeBytes: file.size,
    status: 'transcoding',
  }
}

// Development: upload via API route (local filesystem)
function uploadViaApi(
  file: File,
  onProgress?: (percent: number) => void,
  kind: VideoKind = 'training'
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('video', file)
    formData.append('kind', kind)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        const video = JSON.parse(xhr.responseText)
        resolve({
          id: video.id,
          url: video.url,
          storageKey: video.storageKey,
          filename: video.filename,
          mimeType: video.mimeType,
          sizeBytes: video.sizeBytes,
        })
      } else {
        reject(new Error('Upload failed'))
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.open('POST', '/api/videos')
    xhr.send(formData)
  })
}
