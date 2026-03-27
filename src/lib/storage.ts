import { v4 as uuidv4 } from 'uuid'
import path from 'path'

const IS_VERCEL = !!process.env.BLOB_READ_WRITE_TOKEN

// ── Vercel Blob (production) ──────────────────────────────────────

async function saveToBlobStore(file: File, prefix = '') {
  const { put } = await import('@vercel/blob')
  const ext = path.extname(file.name) || '.webm'
  const blobPath = `${prefix}${uuidv4()}${ext}`

  const blob = await put(blobPath, file, {
    access: 'public',
    contentType: file.type || 'video/mp4',
  })

  // Store the full blob URL as storageKey — getVideoUrl handles http URLs
  return {
    storageKey: blob.url,
    filename: file.name || `recording${ext}`,
    mimeType: file.type || 'video/mp4',
    sizeBytes: file.size,
  }
}

// ── Local filesystem (development) ────────────────────────────────

async function saveToLocal(file: File, subdir = '') {
  const { writeFile, mkdir } = await import('fs/promises')
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', subdir)
  await mkdir(uploadDir, { recursive: true })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const ext = path.extname(file.name) || '.webm'
  const uniqueName = `${uuidv4()}${ext}`
  const storageKey = subdir ? `${subdir}/${uniqueName}` : uniqueName
  const filePath = path.join(uploadDir, uniqueName)

  await writeFile(filePath, buffer)

  return {
    storageKey,
    filename: file.name || `recording${ext}`,
    mimeType: file.type || 'video/mp4',
    sizeBytes: buffer.length,
  }
}

// ── Public API ────────────────────────────────────────────────────

export async function saveVideoFile(file: File) {
  if (IS_VERCEL) {
    return saveToBlobStore(file)
  }
  return saveToLocal(file)
}

export async function saveCandidateVideoFile(file: File) {
  if (IS_VERCEL) {
    return saveToBlobStore(file, 'candidates/')
  }
  return saveToLocal(file, 'candidates')
}

export function getVideoUrl(storageKey: string): string {
  if (storageKey.startsWith('http')) {
    // Add cache-busting for Vercel Blob URLs to avoid ERR_CACHE_OPERATION_NOT_SUPPORTED
    const url = new URL(storageKey)
    url.searchParams.set('v', '1')
    return url.toString()
  }
  return `/api/uploads/${storageKey}`
}

export function getCandidateVideoUrl(storageKey: string): string {
  if (storageKey.startsWith('http')) {
    const url = new URL(storageKey)
    url.searchParams.set('v', '1')
    return url.toString()
  }
  return `/api/uploads/${storageKey}`
}
