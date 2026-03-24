const IS_VERCEL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'

interface UploadResult {
  id?: string
  url: string
  storageKey: string
  filename: string
  mimeType: string
  sizeBytes: number
}

// Fire-and-forget: trigger video analysis (transcription + AI summary) after upload
export function triggerVideoAnalysis(videoId: string, onComplete?: (result: any) => void) {
  fetch(`/api/videos/${videoId}/analyze`, { method: 'POST' })
    .then((res) => res.ok ? res.json() : null)
    .then((data) => { if (data && onComplete) onComplete(data) })
    .catch(() => {})
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

// Production: get client token, then PUT directly to blob.vercel-storage.com
async function uploadViaBlob(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  // Step 1: Get a scoped client token + store URL from our API
  onProgress?.(5)
  const tokenRes = await fetch('/api/videos/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name }),
  })

  if (!tokenRes.ok) throw new Error('Failed to get upload token')
  const { clientToken, storeUrl } = await tokenRes.json()

  // Step 2: Upload directly to Vercel Blob storage via fetch
  let progressInterval: ReturnType<typeof setInterval> | undefined
  let fakeProgress = 10
  if (onProgress) {
    progressInterval = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + 3, 90)
      onProgress(fakeProgress)
    }, 300)
  }

  try {
    const putRes = await fetch(`${storeUrl}/${file.name}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${clientToken}`,
        'Content-Type': file.type || 'video/mp4',
        'x-api-version': '7',
      },
      body: file,
    })

    if (progressInterval) clearInterval(progressInterval)

    if (!putRes.ok) {
      const errText = await putRes.text()
      throw new Error(`Blob upload failed: ${putRes.status} ${errText}`)
    }

    const blob = await putRes.json()
    onProgress?.(95)

    // Step 3: Register the uploaded blob in our DB
    const regRes = await fetch('/api/videos/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: blob.url,
        filename: file.name,
        mimeType: file.type || 'video/mp4',
        sizeBytes: file.size,
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
  } catch (error) {
    if (progressInterval) clearInterval(progressInterval)
    throw error
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
