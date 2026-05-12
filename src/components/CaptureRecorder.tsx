'use client'

// Capture Engine — candidate-facing recorder (Phase 1C stabilization).
//
// Phase 1B shipped audio mode end-to-end. Phase 1C hardens it:
//   - Categorized mic errors with actionable copy and a retry button.
//   - Real upload progress via XMLHttpRequest's upload.onprogress.
//   - beforeunload guard while recording or uploading.
//   - Visible "maximum recording length reached" notice on auto-stop.
//   - Mobile Safari: audio/mp4 picked first when supported, graceful
//     fallback when MediaRecorder is unavailable.
//   - Structured log events for all the lifecycle moments.
//
// State machine:
//   idle → requesting → recording → preview → uploading → submitted
//          \                       \_____________________> failed
//           \___> denied (categorized: permission | no_mic | insecure | unsupported)
//
// Retake returns preview → idle (after revoking the previous blob URL) so
// the candidate can re-request the mic without leaking a MediaStream.
//
// TODO(orphan-cleanup): a `draft`/`uploading` CaptureResponse stays in the
// DB if the candidate closes the tab between presign and finalize. The
// service layer notes the cron sweep that handles this; UI side, we
// stop tracks + revoke object URLs on unmount to free local resources.
// TODO(multipart): once Phase 1F adds video, switch the PUT to a multipart
// upload so we can stream 500MB without holding the full blob in memory.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { captureLog } from '@/lib/capture/capture-log'

export type CaptureRecorderMode = 'audio' // future: | 'video' | 'audio_video'

interface CaptureRecorderProps {
  sessionId: string
  stepId: string
  mode: CaptureRecorderMode
  prompt?: string | null
  allowRetake: boolean
  maxRetakes?: number | null
  maxDurationSec?: number | null
  minDurationSec?: number | null
  onSubmitted: (capture: { id: string; durationSec: number | null }) => void
}

type DeniedReason = 'permission' | 'no_mic' | 'insecure' | 'unsupported' | 'unknown'

type UploadFailureCategory =
  | 'offline' // navigator.onLine === false
  | 'presign' // POST /captures/presign failed (rate limit, feature flag, server error)
  | 'upload'  // S3 PUT failed (network, S3 5xx, abort)
  | 'finalize' // POST /captures/finalize failed (size, MIME, etc.)
  | 'rate_limited' // 429 from any of the three
  | 'unknown'

type RecorderState =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'denied'; reason: DeniedReason; message: string }
  | { kind: 'recording'; startedAt: number; autoStopped?: boolean }
  | { kind: 'preview'; blob: Blob; mimeType: string; durationSec: number; autoStopped: boolean }
  | { kind: 'uploading'; pct: number; blob: Blob; mimeType: string; durationSec: number }
  | { kind: 'submitted'; durationSec: number }
  | {
      kind: 'failed'
      // Recovery: when we have a blob in hand, the user can hit "Try again"
      // and skip re-recording. category lets us tailor the message.
      blob?: Blob
      mimeType?: string
      durationSec?: number
      category: UploadFailureCategory
      message: string
      retryAfterSec?: number
    }

// Order matters: Safari only emits audio/mp4 (AAC) for MediaRecorder. Chrome
// and Firefox prefer webm/opus. Trying mp4 first gives Safari a working path
// without sacrificing anything on other engines — they fall through to webm.
const AUDIO_MIME_CANDIDATES = ['audio/mp4', 'audio/webm', 'audio/ogg']

function detectBrowserSupport(): { ok: true } | { ok: false; reason: DeniedReason; message: string } {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'unsupported', message: 'Browser environment not available.' }
  }
  // getUserMedia requires a secure context (HTTPS or localhost). Pages served
  // over plain HTTP from a non-localhost origin will silently fail with no
  // useful error — pre-check so we can show actionable copy instead.
  if (window.isSecureContext === false) {
    return {
      ok: false,
      reason: 'insecure',
      message:
        'Microphone access requires a secure (https://) connection. Open this page over HTTPS and try again.',
    }
  }
  if (!navigator?.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reason: 'unsupported',
      message:
        'Your browser doesn\'t support audio recording. Try the latest Chrome, Safari, Edge, or Firefox.',
    }
  }
  if (typeof window.MediaRecorder === 'undefined') {
    return {
      ok: false,
      reason: 'unsupported',
      message:
        'Your browser doesn\'t support audio recording (MediaRecorder unavailable). Try the latest Chrome, Safari, Edge, or Firefox.',
    }
  }
  return { ok: true }
}

function pickSupportedAudioMime(): string {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return AUDIO_MIME_CANDIDATES[0]
  }
  for (const t of AUDIO_MIME_CANDIDATES) {
    try {
      if (window.MediaRecorder.isTypeSupported(t)) return t
    } catch {
      // Some old engines throw on unknown types — fall through.
    }
  }
  return AUDIO_MIME_CANDIDATES[0]
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getUserMediaErrorReason(err: any): { reason: DeniedReason; message: string } {
  const name = err?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      reason: 'permission',
      message:
        'Microphone access was blocked. Click the lock/camera icon in your browser\'s address bar, allow microphone access, then click Retry below.',
    }
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      reason: 'no_mic',
      message:
        'No microphone was detected on this device. Plug in a microphone (or check your headset) and click Retry.',
    }
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      reason: 'unknown',
      message:
        'Another application appears to be using your microphone. Close apps like Zoom or Meet that might have the mic, then click Retry.',
    }
  }
  return { reason: 'unknown', message: 'Could not start recording. Click Retry to try again.' }
}

// Upload via XHR so we get real upload-progress events; fetch() doesn't.
function uploadBlobWithProgress(opts: {
  url: string
  blob: Blob
  mimeType: string
  onProgress: (pct: number) => void
  signal?: AbortSignal
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', opts.url, true)
    xhr.setRequestHeader('Content-Type', opts.mimeType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed (HTTP ${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Upload failed (network error)'))
    xhr.onabort = () => reject(new Error('Upload aborted'))
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(opts.blob)
  })
}

export default function CaptureRecorder(props: CaptureRecorderProps) {
  const {
    sessionId,
    stepId,
    mode,
    prompt,
    allowRetake,
    maxRetakes,
    maxDurationSec,
    minDurationSec,
    onSubmitted,
  } = props

  // Run support detection at mount. We don't auto-start; the candidate clicks
  // the button, which triggers getUserMedia under a user gesture (required by
  // Safari and other engines for permission prompts).
  const support = useMemo(() => (typeof window === 'undefined' ? null : detectBrowserSupport()), [])
  const [state, setState] = useState<RecorderState>(() => {
    if (support && support.ok === false) {
      return { kind: 'denied', reason: support.reason, message: support.message }
    }
    return { kind: 'idle' }
  })

  const [retakesUsed, setRetakesUsed] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const previewUrlRef = useRef<string | null>(null)
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)
  // Tracks whether the recorder was auto-stopped at maxDurationSec. Surfaced
  // on the preview state so the candidate sees why the recording ended.
  const autoStoppedRef = useRef<boolean>(false)
  // AbortController for the in-flight upload, so retake during upload can
  // cancel and reclaim the mic.
  const uploadAbortRef = useRef<AbortController | null>(null)

  const remainingRetakes = useMemo(() => {
    if (!allowRetake) return 0
    if (maxRetakes == null) return Infinity
    return Math.max(0, maxRetakes - retakesUsed)
  }, [allowRetake, maxRetakes, retakesUsed])

  const audioMime = useMemo(() => pickSupportedAudioMime(), [])

  // beforeunload guard. Active only while recording or uploading — we don't
  // want to nag the candidate before they've started, or after they've
  // submitted. Spec is "preventDefault + assign returnValue" for legacy
  // browsers; modern Chrome ignores the returnValue text but still shows a
  // confirm dialog.
  useEffect(() => {
    const active = state.kind === 'recording' || state.kind === 'uploading'
    if (!active) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [state.kind])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (tickerRef.current) clearInterval(tickerRef.current)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      if (uploadAbortRef.current) uploadAbortRef.current.abort()
    }
  }, [])

  const stopTicker = useCallback(() => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current)
      tickerRef.current = null
    }
  }, [])

  const stopRecording = useCallback((opts?: { autoStopped?: boolean }) => {
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') {
      autoStoppedRef.current = opts?.autoStopped === true
      rec.stop()
    }
  }, [])

  const startTicker = useCallback(
    (startedAt: number) => {
      if (tickerRef.current) clearInterval(tickerRef.current)
      tickerRef.current = setInterval(() => {
        const sec = (Date.now() - startedAt) / 1000
        setElapsedSec(sec)
        if (maxDurationSec != null && sec >= maxDurationSec) {
          stopRecording({ autoStopped: true })
        }
      }, 250)
    },
    [maxDurationSec, stopRecording]
  )

  const startRecording = useCallback(async () => {
    // Re-check support in case the browser state changed (rare, but cheap).
    const sup = detectBrowserSupport()
    if (!sup.ok) {
      setState({ kind: 'denied', reason: sup.reason, message: sup.message })
      captureLog('capture_permission_denied', { sessionId, stepId, mode, reason: sup.reason })
      return
    }

    setState({ kind: 'requesting' })
    try {
      const constraints: MediaStreamConstraints =
        mode === 'audio' ? { audio: true } : { audio: true, video: true }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, { mimeType: audioMime })
      } catch {
        // Some Safari builds reject the constructor when the mimeType isn't
        // supported even after isTypeSupported returns true. Fall back to
        // letting MediaRecorder pick the default; we use recorder.mimeType
        // downstream to find out what we actually got.
        recorder = new MediaRecorder(stream)
      }

      chunksRef.current = []
      autoStoppedRef.current = false
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stopTicker()
        const effectiveMime = recorder.mimeType || audioMime
        const blob = new Blob(chunksRef.current, { type: effectiveMime })
        const durationSec = (Date.now() - startedAtRef.current) / 1000
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = URL.createObjectURL(blob)
        const auto = autoStoppedRef.current
        captureLog('capture_recording_stopped', {
          sessionId,
          stepId,
          mode,
          durationSec,
          sizeBytes: blob.size,
          mimeType: effectiveMime,
          autoStopped: auto,
        })
        setState({
          kind: 'preview',
          blob,
          mimeType: effectiveMime,
          durationSec,
          autoStopped: auto,
        })
      }

      const startedAt = Date.now()
      startedAtRef.current = startedAt
      mediaRecorderRef.current = recorder
      recorder.start(250)
      setElapsedSec(0)
      setState({ kind: 'recording', startedAt })
      startTicker(startedAt)
      captureLog('capture_recording_started', { sessionId, stepId, mode, mimeType: audioMime })
    } catch (err: any) {
      const { reason, message } = getUserMediaErrorReason(err)
      setState({ kind: 'denied', reason, message })
      captureLog('capture_permission_denied', {
        sessionId,
        stepId,
        mode,
        reason,
        errorCode: err?.name,
      })
    }
  }, [audioMime, mode, sessionId, stepId, startTicker, stopTicker])

  const retake = useCallback(() => {
    if (!allowRetake) return
    if (remainingRetakes <= 0) return
    // If a retake is requested mid-upload, cancel the upload first.
    if (uploadAbortRef.current) {
      uploadAbortRef.current.abort()
      uploadAbortRef.current = null
    }
    setRetakesUsed((n) => n + 1)
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setElapsedSec(0)
    setState({ kind: 'idle' })
    captureLog('capture_recording_aborted', { sessionId, stepId, mode, reason: 'retake' })
  }, [allowRetake, remainingRetakes, sessionId, stepId, mode])

  // Submit accepts either the current preview state OR (when recovering from
  // a failure) the preserved blob/mimeType/durationSec triple. This is what
  // lets "Try again" skip re-recording when the network was the problem.
  const submit = useCallback(
    async (override?: { blob: Blob; mimeType: string; durationSec: number }) => {
      const payload =
        override ||
        (state.kind === 'preview'
          ? { blob: state.blob, mimeType: state.mimeType, durationSec: state.durationSec }
          : null)
      if (!payload) return

      if (minDurationSec != null && payload.durationSec < minDurationSec) {
        setState({
          kind: 'failed',
          category: 'unknown',
          blob: payload.blob,
          mimeType: payload.mimeType,
          durationSec: payload.durationSec,
          message: `Recording is too short — please record at least ${minDurationSec}s.`,
        })
        return
      }

      // Quick offline pre-check. navigator.onLine is best-effort — false
      // strongly implies offline, true means "the OS thinks we have an
      // interface up", not actual connectivity. We still try the request
      // and fall back to the per-stage catches below if onLine lied.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setState({
          kind: 'failed',
          category: 'offline',
          blob: payload.blob,
          mimeType: payload.mimeType,
          durationSec: payload.durationSec,
          message: 'You appear to be offline. Reconnect to Wi-Fi or mobile data and try again — your recording is saved.',
        })
        captureLog('capture_upload_failed', { sessionId, stepId, mode, reason: 'offline_precheck' })
        return
      }

      setState({
        kind: 'uploading',
        pct: 0,
        blob: payload.blob,
        mimeType: payload.mimeType,
        durationSec: payload.durationSec,
      })
      const abort = new AbortController()
      uploadAbortRef.current = abort
      captureLog('capture_upload_started', {
        sessionId,
        stepId,
        mode,
        mimeType: payload.mimeType,
        sizeBytes: payload.blob.size,
        durationSec: payload.durationSec,
      })

      // Per-stage failure handling so the UI can distinguish presign vs. PUT
      // vs. finalize errors and the user gets actionable copy.
      let stage: 'presign' | 'upload' | 'finalize' = 'presign'
      let captureIdLocal: string | null = null
      try {
        const presignRes = await fetch(`/api/public/sessions/${sessionId}/captures/presign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepId, mode, mimeType: payload.mimeType }),
          signal: abort.signal,
        })
        if (!presignRes.ok) {
          const body = await presignRes.json().catch(() => ({} as any))
          // Rate limit gets its own category so the UI can show a wait time.
          if (presignRes.status === 429) {
            const retryAfter = parseInt(presignRes.headers.get('Retry-After') || '', 10)
            const err: any = new Error(body?.error || 'Too many requests — please wait and try again.')
            err.category = 'rate_limited'
            err.retryAfterSec = Number.isFinite(retryAfter) ? retryAfter : undefined
            throw err
          }
          throw new Error(body?.error || `Presign failed (${presignRes.status})`)
        }
        const { captureId, uploadUrl } = (await presignRes.json()) as {
          captureId: string
          uploadUrl: string
        }
        captureIdLocal = captureId

        stage = 'upload'
        await uploadBlobWithProgress({
          url: uploadUrl,
          blob: payload.blob,
          mimeType: payload.mimeType,
          onProgress: (pct) => {
            setState((s) => (s.kind === 'uploading' ? { ...s, pct } : s))
            if (pct === 25 || pct === 50 || pct === 75 || pct === 100) {
              captureLog('capture_upload_progress', { sessionId, stepId, captureId, mode, pct })
            }
          },
          signal: abort.signal,
        })

        stage = 'finalize'
        captureLog('capture_finalize_started', { sessionId, stepId, captureId, mode })
        const finalRes = await fetch(`/api/public/sessions/${sessionId}/captures/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captureId, durationSec: payload.durationSec }),
          signal: abort.signal,
        })
        if (!finalRes.ok) {
          const body = await finalRes.json().catch(() => ({} as any))
          captureLog('capture_finalize_failed', {
            sessionId,
            stepId,
            captureId,
            mode,
            statusCode: finalRes.status,
            reason: body?.error,
          })
          // 409 with code='upload_not_visible' means S3 hasn't seen our PUT
          // yet — extremely unusual but the server tells us to retry. Surface
          // a softer message so the candidate doesn't think their recording
          // is gone.
          if (finalRes.status === 409 && body?.code === 'upload_not_visible') {
            const err: any = new Error('Upload not visible yet — please try again in a moment.')
            err.category = 'finalize'
            throw err
          }
          if (finalRes.status === 429) {
            const retryAfter = parseInt(finalRes.headers.get('Retry-After') || '', 10)
            const err: any = new Error(body?.error || 'Too many requests — please wait and try again.')
            err.category = 'rate_limited'
            err.retryAfterSec = Number.isFinite(retryAfter) ? retryAfter : undefined
            throw err
          }
          throw new Error(body?.error || `Finalize failed (${finalRes.status})`)
        }
        const { capture } = (await finalRes.json()) as {
          capture: { id: string; durationSec: number | null }
        }

        captureLog('capture_finalize_completed', {
          sessionId,
          stepId,
          captureId: capture.id,
          mode,
          durationSec: capture.durationSec ?? payload.durationSec,
        })
        captureLog('capture_upload_completed', {
          sessionId,
          stepId,
          captureId: capture.id,
          mode,
          sizeBytes: payload.blob.size,
        })

        uploadAbortRef.current = null
        setState({ kind: 'submitted', durationSec: payload.durationSec })
        onSubmitted({ id: capture.id, durationSec: capture.durationSec })
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // Retake cancelled the upload — state already moved to 'idle'.
          return
        }
        const category: UploadFailureCategory =
          err?.category ||
          (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : stage)
        captureLog('capture_upload_failed', {
          sessionId,
          stepId,
          captureId: captureIdLocal ?? undefined,
          mode,
          reason: err?.message || 'unknown',
          stage,
        })
        uploadAbortRef.current = null
        const friendly =
          category === 'offline'
            ? 'You appear to be offline. Reconnect and try again — your recording is saved.'
            : category === 'rate_limited'
              ? err?.message || 'Too many requests. Please wait a moment and try again — your recording is saved.'
              : category === 'presign'
                ? 'Could not start the upload. Your recording is saved; please try again.'
                : category === 'upload'
                  ? 'Upload was interrupted. Your recording is saved; please try again.'
                  : category === 'finalize'
                    ? 'Upload finished but the server didn\'t confirm. Your recording is saved; try again in a moment.'
                    : err?.message || 'Something went wrong submitting your recording.'
        setState({
          kind: 'failed',
          category,
          blob: payload.blob,
          mimeType: payload.mimeType,
          durationSec: payload.durationSec,
          message: friendly,
          retryAfterSec: err?.retryAfterSec,
        })
      }
    },
    [state, sessionId, stepId, mode, minDurationSec, onSubmitted]
  )

  // ── Render ────────────────────────────────────────────────────────

  const promptBlock = prompt ? (
    <p className="text-sm text-[#59595A] mb-3 whitespace-pre-wrap">{prompt}</p>
  ) : null

  const cap = maxDurationSec ?? null
  const elapsedDisplay = formatElapsed(
    state.kind === 'recording' ? elapsedSec : state.kind === 'preview' ? state.durationSec : 0
  )

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 sm:p-5">
      {promptBlock}

      {state.kind === 'idle' && (
        <div className="space-y-3">
          <p className="text-sm text-[#656567]">
            Record your answer. Your browser will ask permission to use your microphone. You can preview before submitting.
            {allowRetake && remainingRetakes > 0 && remainingRetakes !== Infinity ? (
              <> Retakes allowed: {remainingRetakes}.</>
            ) : allowRetake && remainingRetakes === Infinity ? (
              <> Retakes allowed.</>
            ) : null}
          </p>
          <button
            type="button"
            onClick={startRecording}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF9500] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#e6850a] focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:ring-offset-2"
          >
            <span className="block h-2.5 w-2.5 rounded-full bg-white" />
            Record your answer
            {cap ? <span className="text-white/80">· up to {formatElapsed(cap)}</span> : null}
          </button>
          {retakesUsed > 0 ? (
            <p className="text-xs text-[#656567]">
              Retake {retakesUsed} of {maxRetakes ?? '∞'}
            </p>
          ) : null}
        </div>
      )}

      {state.kind === 'requesting' && (
        <p className="text-sm text-[#59595A]">Requesting microphone access…</p>
      )}

      {state.kind === 'denied' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800 mb-1">
              {state.reason === 'permission' && "Can't access your microphone"}
              {state.reason === 'no_mic' && 'No microphone found'}
              {state.reason === 'insecure' && 'Secure connection required'}
              {state.reason === 'unsupported' && 'Browser not supported'}
              {state.reason === 'unknown' && 'Recording is unavailable'}
            </p>
            <p className="text-xs text-red-700">{state.message}</p>
            {state.reason === 'permission' ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-red-700 space-y-1">
                <li>Look for the camera/lock icon next to the URL.</li>
                <li>Set Microphone to "Allow" for this site.</li>
                <li>Reload the page if the change doesn't take effect.</li>
              </ul>
            ) : null}
          </div>
          {state.reason !== 'unsupported' && state.reason !== 'insecure' ? (
            <button
              type="button"
              onClick={startRecording}
              className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm hover:bg-[#F7F7F8]"
            >
              Retry
            </button>
          ) : null}
        </div>
      )}

      {state.kind === 'recording' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            <span className="font-mono text-sm tabular-nums text-[#262626]">{elapsedDisplay}</span>
            {cap ? <span className="text-xs text-[#656567]">/ {formatElapsed(cap)}</span> : null}
          </div>
          <button
            type="button"
            onClick={() => stopRecording()}
            className="w-full sm:w-auto rounded-lg border border-[#E4E4E7] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#F7F7F8]"
          >
            Stop
          </button>
        </div>
      )}

      {state.kind === 'preview' && (
        <div className="space-y-3">
          {state.autoStopped && cap ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Maximum recording length ({formatElapsed(cap)}) reached — recording stopped automatically.
            </div>
          ) : null}
          <audio
            key={previewUrlRef.current || ''}
            src={previewUrlRef.current || undefined}
            controls
            className="w-full"
          />
          <p className="text-xs text-[#656567]">Recorded {formatElapsed(state.durationSec)}.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => submit()}
              className="rounded-lg bg-[#FF9500] px-4 py-2 text-sm font-medium text-white hover:bg-[#e6850a]"
            >
              Submit
            </button>
            {allowRetake && remainingRetakes > 0 ? (
              <button
                type="button"
                onClick={retake}
                className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm hover:bg-[#F7F7F8]"
              >
                Retake
                {maxRetakes != null ? (
                  <span className="ml-1 text-xs text-[#656567]">({remainingRetakes} left)</span>
                ) : null}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {state.kind === 'uploading' && (
        <div className="space-y-2" aria-busy="true">
          <p className="text-sm text-[#59595A]">
            Uploading your recording… {state.pct > 0 ? `${state.pct}%` : ''}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F1F1F3]">
            <div
              className="h-full bg-[#FF9500] transition-all duration-300"
              style={{ width: `${Math.max(5, state.pct)}%` }}
            />
          </div>
          <p className="text-[11px] text-[#656567]">
            Please keep this tab open until the upload finishes.
          </p>
          {/* Submit is replaced by a disabled placeholder so the candidate can't
              double-click and queue a second presign while the first is in flight. */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="mt-2 rounded-lg bg-[#FF9500] px-4 py-2 text-sm font-medium text-white opacity-60 cursor-not-allowed"
          >
            Submitting…
          </button>
        </div>
      )}

      {state.kind === 'submitted' && (
        <p className="text-sm font-medium text-green-700">
          Submitted — thank you. {formatElapsed(state.durationSec)} recorded.
        </p>
      )}

      {state.kind === 'failed' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
            <p className="text-sm font-medium text-red-800">
              {state.category === 'offline' && 'You\'re offline'}
              {state.category === 'rate_limited' && 'Too many attempts'}
              {state.category === 'presign' && 'Couldn\'t start the upload'}
              {state.category === 'upload' && 'Upload was interrupted'}
              {state.category === 'finalize' && 'Server didn\'t confirm the upload'}
              {state.category === 'unknown' && 'Something went wrong'}
            </p>
            <p className="text-xs text-red-700">{state.message}</p>
            {state.retryAfterSec ? (
              <p className="text-xs text-red-600">Please wait {state.retryAfterSec}s before retrying.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {state.blob && state.mimeType && state.durationSec != null ? (
              // Recovery path: re-use the preserved blob so the candidate
              // doesn't have to record again.
              <button
                type="button"
                onClick={() =>
                  submit({
                    blob: state.blob!,
                    mimeType: state.mimeType!,
                    durationSec: state.durationSec!,
                  })
                }
                className="rounded-lg bg-[#FF9500] px-4 py-2 text-sm font-medium text-white hover:bg-[#e6850a]"
              >
                Try again
              </button>
            ) : null}
            {allowRetake && remainingRetakes > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setRetakesUsed((n) => n + 1)
                  if (previewUrlRef.current) {
                    URL.revokeObjectURL(previewUrlRef.current)
                    previewUrlRef.current = null
                  }
                  setState({ kind: 'idle' })
                }}
                className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm hover:bg-[#F7F7F8]"
              >
                Re-record instead
              </button>
            ) : null}
            {!state.blob ? (
              <button
                type="button"
                onClick={() => setState({ kind: 'idle' })}
                className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm hover:bg-[#F7F7F8]"
              >
                Start over
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
