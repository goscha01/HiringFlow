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

export type VideoKind = 'interview' | 'training'

export async function uploadVideoFile(
  file: File,
  onProgress?: (percent: number) => void,
  kind: VideoKind = 'training'
): Promise<UploadResult> {
  if (IS_VERCEL) {
    return uploadViaBlob(file, onProgress, kind)
  }
  return uploadViaApi(file, onProgress, kind)
}

// Production: get presigned S3 URL, upload directly from browser
// No file data goes through our server — unlimited file size
async function uploadViaBlob(
  file: File,
  onProgress?: (percent: number) => void,
  kind: VideoKind = 'training'
): Promise<UploadResult> {
  onProgress?.(5)

  // Step 1: Get presigned URL from our API (tiny JSON request)
  const tokenRes = await fetch('/api/videos/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type || 'video/mp4' }),
  })

  if (!tokenRes.ok) throw new Error('Failed to get upload URL')
  const { uploadUrl, publicUrl, key } = await tokenRes.json()

  // Step 2: Upload directly to S3 via presigned URL with progress
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 85))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed'))

    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')
    xhr.send(file)
  })

  onProgress?.(90)

  // Step 3: Register in DB + trigger analysis
  const regRes = await fetch('/api/videos/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: publicUrl,
      filename: file.name,
      mimeType: file.type || 'video/mp4',
      sizeBytes: file.size,
      storageKey: key,
      analyze: true,
      kind,
    }),
  })

  onProgress?.(100)

  if (!regRes.ok) throw new Error('Failed to register video')

  const video = await regRes.json()
  return {
    id: video.id,
    url: video.url || publicUrl,
    storageKey: video.storageKey || key,
    filename: video.filename,
    mimeType: video.mimeType,
    sizeBytes: video.sizeBytes,
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
