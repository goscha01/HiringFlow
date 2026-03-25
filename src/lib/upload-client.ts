const IS_VERCEL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'

interface UploadResult {
  id?: string
  url: string
  storageKey: string
  filename: string
  mimeType: string
  sizeBytes: number
}

// Trigger video analysis (transcription + AI summary) after upload
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

export async function uploadVideoFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  if (IS_VERCEL) {
    return uploadViaBlob(file, onProgress)
  }
  return uploadViaApi(file, onProgress)
}

// Production: stream file to our Edge API which PUTs to Vercel Blob
// Edge runtime has no body size limit, so large videos work
async function uploadViaBlob(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  onProgress?.(5)

  // Use XMLHttpRequest for real progress tracking
  const blobResult = await new Promise<{ url: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 85))
      }
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed'))

    xhr.open('POST', '/api/videos/upload-url')
    xhr.setRequestHeader('x-filename', file.name)
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')
    xhr.send(file)
  })

  onProgress?.(90)

  // Register in DB + trigger analysis
  const regRes = await fetch('/api/videos/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: blobResult.url,
      filename: file.name,
      mimeType: file.type || 'video/mp4',
      sizeBytes: file.size,
      analyze: true,
    }),
  })

  onProgress?.(100)

  if (!regRes.ok) throw new Error('Failed to register video')

  const video = await regRes.json()
  return {
    id: video.id,
    url: video.url,
    storageKey: video.storageKey,
    filename: video.filename,
    mimeType: video.mimeType,
    sizeBytes: video.sizeBytes,
  }
}

// Development: upload via API route (local filesystem)
function uploadViaApi(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('video', file)

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
