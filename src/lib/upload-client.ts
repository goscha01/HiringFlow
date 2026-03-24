const IS_VERCEL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'

interface UploadResult {
  id?: string
  url: string
  storageKey: string
  filename: string
  mimeType: string
  sizeBytes: number
}

export async function uploadVideoFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  if (IS_VERCEL) {
    return uploadViaBlobClient(file, onProgress)
  }
  return uploadViaApi(file, onProgress)
}

// Production: upload to Vercel Blob via client SDK, then register in DB
async function uploadViaBlobClient(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const { upload } = await import('@vercel/blob/client')

  let progressInterval: ReturnType<typeof setInterval> | undefined
  let fakeProgress = 0
  if (onProgress) {
    progressInterval = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + 5, 90)
      onProgress(fakeProgress)
    }, 200)
  }

  try {
    const blob = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: '/api/videos/upload-url',
    })

    if (progressInterval) clearInterval(progressInterval)
    onProgress?.(95)

    // Register the uploaded blob in the database
    const res = await fetch('/api/videos/register', {
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

    if (!res.ok) throw new Error('Failed to register video')

    const video = await res.json()
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
