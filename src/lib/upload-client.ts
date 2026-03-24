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
    return uploadViaBlob(file, onProgress)
  }
  return uploadViaApi(file, onProgress)
}

// Production: stream file to edge function which puts it in Vercel Blob
async function uploadViaBlob(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  // Simulate progress (fetch doesn't expose upload progress)
  let progressInterval: ReturnType<typeof setInterval> | undefined
  let fakeProgress = 0
  if (onProgress) {
    progressInterval = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + 3, 90)
      onProgress(fakeProgress)
    }, 300)
  }

  try {
    const res = await fetch('/api/videos/upload-blob', {
      method: 'POST',
      headers: {
        'x-filename': file.name,
        'x-content-type': file.type || 'video/mp4',
        'x-file-size': String(file.size),
      },
      body: file,
    })

    if (progressInterval) clearInterval(progressInterval)
    onProgress?.(100)

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Upload failed: ${err}`)
    }

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
