'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { uploadVideoFile, type VideoKind } from '@/lib/upload-client'

export interface UploadEntry {
  id: string
  filename: string
  kind: VideoKind
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
  startedAt: number
}

// What `startUpload` resolves with on success — mirrors the legacy
// `UploadResult` from `lib/upload-client` so callers can swap from direct
// `uploadVideoFile` calls to provider-managed uploads without changing what
// they do with the result.
export interface UploadOutcome {
  videoId: string
  filename: string
  mimeType: string
  sizeBytes: number
}

interface UploadCtx {
  uploads: UploadEntry[]
  inFlightCount: number
  /** Resolves with the new video id on success, throws on failure. */
  startUpload: (file: File, kind: VideoKind) => Promise<UploadOutcome>
  clearFinished: () => void
  /** Subscribers re-render once any upload reaches `success` so they can refetch. */
  successTick: number
}

const UploadContext = createContext<UploadCtx | null>(null)

// Single source of truth for in-progress video uploads, mounted at the
// dashboard layout level so XHR PUTs survive navigation between tabs
// (candidates → automations → trainings) without aborting. This is the
// difference between "you have to stare at the upload page until it's done"
// and "kick off the upload, switch to the candidates tab, keep working".
//
// What doesn't survive: full page reload (component tree tears down), closing
// the tab/browser (browser kills the XHR). Both are guarded by a beforeunload
// dialog while any upload is in-flight.
export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadEntry[]>([])
  const [successTick, setSuccessTick] = useState(0)

  const startUpload = useCallback(async (file: File, kind: VideoKind): Promise<UploadOutcome> => {
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setUploads((prev) => [...prev, { id: localId, filename: file.name, kind, progress: 0, status: 'pending', startedAt: Date.now() }])
    try {
      const result = await uploadVideoFile(file, (progress) => {
        setUploads((prev) => prev.map((u) => (u.id === localId ? { ...u, progress, status: 'uploading' } : u)))
      }, kind)
      setUploads((prev) => prev.map((u) => (u.id === localId ? { ...u, progress: 100, status: 'success' } : u)))
      setSuccessTick((t) => t + 1)
      return {
        videoId: result.id || '',
        filename: result.filename,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploads((prev) => prev.map((u) => (u.id === localId ? { ...u, status: 'error', error: msg } : u)))
      throw err
    }
  }, [])

  const clearFinished = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status === 'pending' || u.status === 'uploading'))
  }, [])

  const inFlightCount = uploads.filter((u) => u.status === 'pending' || u.status === 'uploading').length

  // Browser warning when the user tries to close the tab / navigate the
  // whole window (typing a new URL, hitting back). Within the dashboard SPA,
  // tab-switching keeps the provider mounted so the upload survives — this
  // guard is only for the genuinely destructive cases.
  useEffect(() => {
    if (inFlightCount === 0) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // Chrome shows its standard "Leave site?" dialog
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [inFlightCount])

  return (
    <UploadContext.Provider value={{ uploads, inFlightCount, startUpload, clearFinished, successTick }}>
      {children}
    </UploadContext.Provider>
  )
}

export function useUploads(): UploadCtx {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUploads must be used within <UploadProvider>')
  return ctx
}
