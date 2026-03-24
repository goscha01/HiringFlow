import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

export async function saveVideoFile(file: File): Promise<{
  storageKey: string
  filename: string
  mimeType: string
  sizeBytes: number
}> {
  // Ensure upload directory exists
  await mkdir(UPLOAD_DIR, { recursive: true })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Generate unique filename
  const ext = path.extname(file.name)
  const storageKey = `${uuidv4()}${ext}`
  const filePath = path.join(UPLOAD_DIR, storageKey)

  await writeFile(filePath, buffer)

  return {
    storageKey,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: buffer.length,
  }
}

export function getVideoUrl(storageKey: string): string {
  return `/api/uploads/${storageKey}`
}

const CANDIDATE_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'candidates')

export async function saveCandidateVideoFile(file: File): Promise<{
  storageKey: string
  filename: string
  mimeType: string
  sizeBytes: number
}> {
  await mkdir(CANDIDATE_UPLOAD_DIR, { recursive: true })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const ext = path.extname(file.name) || '.webm'
  const uniqueName = `${uuidv4()}${ext}`
  const storageKey = `candidates/${uniqueName}`
  const filePath = path.join(CANDIDATE_UPLOAD_DIR, uniqueName)

  await writeFile(filePath, buffer)

  return {
    storageKey,
    filename: file.name || `recording${ext}`,
    mimeType: file.type || 'video/webm',
    sizeBytes: buffer.length,
  }
}

export function getCandidateVideoUrl(storageKey: string): string {
  return `/api/uploads/${storageKey}`
}
