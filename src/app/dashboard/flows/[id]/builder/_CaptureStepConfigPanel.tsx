'use client'

// Builder edit panel for stepType='capture' (audio answer).
//
// Owns its own form state + per-field error tracking so the parent builder
// can replace the previous alert()-on-bad-config UX with inline messages.
// Whenever the resolved config validates, the parent receives a PATCH; while
// it doesn't, the parent receives `setValidityError(true)` so it can disable
// the modal's Save button.

import { useCallback, useMemo, useState } from 'react'
import {
  tryParseCaptureConfig,
  validateCaptureConfig,
  type CaptureConfig,
} from '@/lib/capture/capture-config'

type FieldKey = 'prompt' | 'minDurationSec' | 'maxDurationSec' | 'maxRetakes'

interface Props {
  stepId: string
  captureConfig: unknown
  onPatch: (config: CaptureConfig) => void
  onValidityChange?: (invalid: boolean) => void
}

interface Draft {
  prompt: string
  required: boolean
  allowRetake: boolean
  minDurationSec: string
  maxDurationSec: string
  maxRetakes: string
}

function configToDraft(cfg: CaptureConfig): Draft {
  return {
    prompt: cfg.prompt ?? '',
    required: cfg.required,
    allowRetake: cfg.allowRetake,
    minDurationSec: cfg.minDurationSec != null ? String(cfg.minDurationSec) : '',
    maxDurationSec: cfg.maxDurationSec != null ? String(cfg.maxDurationSec) : '',
    maxRetakes: cfg.maxRetakes != null ? String(cfg.maxRetakes) : '',
  }
}

function draftToConfig(draft: Draft): { ok: true; value: CaptureConfig } | { ok: false; errors: string[] } {
  const blob: Record<string, unknown> = {
    mode: 'audio',
    required: draft.required,
    allowRetake: draft.allowRetake,
    transcriptionEnabled: false,
    aiAnalysisEnabled: false,
  }
  if (draft.prompt.trim()) blob.prompt = draft.prompt.trim()
  if (draft.minDurationSec.trim()) {
    const n = parseInt(draft.minDurationSec, 10)
    if (Number.isFinite(n)) blob.minDurationSec = n
  }
  if (draft.maxDurationSec.trim()) {
    const n = parseInt(draft.maxDurationSec, 10)
    if (Number.isFinite(n)) blob.maxDurationSec = n
  }
  if (draft.allowRetake && draft.maxRetakes.trim()) {
    const n = parseInt(draft.maxRetakes, 10)
    if (Number.isFinite(n)) blob.maxRetakes = n
  }
  return validateCaptureConfig(blob)
}

// Parse a Zod issue path back into our local field key. Anything we don't
// surface as a field-level error becomes a top-level banner string.
function issuesToFieldErrors(errors: string[]): {
  fields: Partial<Record<FieldKey, string>>
  topLevel: string | null
} {
  const fields: Partial<Record<FieldKey, string>> = {}
  const top: string[] = []
  for (const e of errors) {
    if (e.startsWith('prompt')) fields.prompt = e.split(': ').slice(1).join(': ') || e
    else if (e.startsWith('minDurationSec')) fields.minDurationSec = e.split(': ').slice(1).join(': ') || e
    else if (e.startsWith('maxDurationSec')) fields.maxDurationSec = e.split(': ').slice(1).join(': ') || e
    else if (e.startsWith('maxRetakes')) fields.maxRetakes = e.split(': ').slice(1).join(': ') || e
    else top.push(e)
  }
  return { fields, topLevel: top.length ? top.join('; ') : null }
}

export default function CaptureStepConfigPanel({ stepId, captureConfig, onPatch, onValidityChange }: Props) {
  const initial = useMemo<CaptureConfig>(
    () =>
      (tryParseCaptureConfig(captureConfig) || {
        mode: 'audio',
        required: true,
        allowRetake: true,
        transcriptionEnabled: false,
        aiAnalysisEnabled: false,
      }) as CaptureConfig,
    // Re-seed only when the step id changes so editing one step doesn't
    // reset the draft when another field re-renders the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stepId]
  )
  const [draft, setDraft] = useState<Draft>(() => configToDraft(initial))
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [topLevelError, setTopLevelError] = useState<string | null>(null)

  const commit = useCallback(
    (nextDraft: Draft) => {
      setDraft(nextDraft)
      const result = draftToConfig(nextDraft)
      if (result.ok) {
        setFieldErrors({})
        setTopLevelError(null)
        onValidityChange?.(false)
        onPatch(result.value)
        return
      }
      const split = issuesToFieldErrors(result.errors)
      setFieldErrors(split.fields)
      setTopLevelError(split.topLevel)
      onValidityChange?.(true)
    },
    [onPatch, onValidityChange]
  )

  const fieldClass = (k: FieldKey, base: string) =>
    fieldErrors[k]
      ? `${base} border-red-400 focus:ring-red-300`
      : base

  const inputBase =
    'w-full px-4 py-2.5 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500'
  const textareaBase =
    'w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="space-y-4">
      <div className="text-[11px] uppercase tracking-wide text-grey-40">
        Audio answer · candidate records via microphone
      </div>

      {topLevelError && (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {topLevelError}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-grey-20 mb-1.5">Prompt for candidate</label>
        <textarea
          value={draft.prompt}
          onChange={(e) => commit({ ...draft, prompt: e.target.value })}
          rows={3}
          placeholder="e.g. Record a 30-second introduction about your experience."
          className={fieldClass('prompt', textareaBase)}
        />
        {fieldErrors.prompt ? (
          <p className="text-[11px] text-red-600 mt-1">{fieldErrors.prompt}</p>
        ) : (
          <p className="text-[11px] text-grey-50 mt-1">Shown above the recorder. The candidate can preview before submitting.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-grey-20 mb-1.5">Min duration (sec)</label>
          <input
            type="number"
            min={0}
            value={draft.minDurationSec}
            onChange={(e) => commit({ ...draft, minDurationSec: e.target.value })}
            placeholder="optional"
            className={fieldClass('minDurationSec', inputBase)}
          />
          {fieldErrors.minDurationSec ? (
            <p className="text-[11px] text-red-600 mt-1">{fieldErrors.minDurationSec}</p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-medium text-grey-20 mb-1.5">Max duration (sec)</label>
          <input
            type="number"
            min={1}
            value={draft.maxDurationSec}
            onChange={(e) => commit({ ...draft, maxDurationSec: e.target.value })}
            placeholder="e.g. 120"
            className={fieldClass('maxDurationSec', inputBase)}
          />
          {fieldErrors.maxDurationSec ? (
            <p className="text-[11px] text-red-600 mt-1">{fieldErrors.maxDurationSec}</p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-surface-border pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-grey-20">Required</label>
          <button
            onClick={() => commit({ ...draft, required: !draft.required })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${draft.required ? 'bg-[#FF9500]' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${draft.required ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-grey-20">Allow retakes</label>
          <button
            onClick={() => {
              const nextAllow = !draft.allowRetake
              // When disabling retakes, clear the maxRetakes field so the
              // validator's "maxRetakes requires allowRetake" rule doesn't
              // flag it.
              commit({ ...draft, allowRetake: nextAllow, maxRetakes: nextAllow ? draft.maxRetakes : '' })
            }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${draft.allowRetake ? 'bg-[#FF9500]' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${draft.allowRetake ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {draft.allowRetake && (
          <div>
            <label className="block text-sm font-medium text-grey-20 mb-1.5">Max retakes</label>
            <input
              type="number"
              min={1}
              max={20}
              value={draft.maxRetakes}
              onChange={(e) => commit({ ...draft, maxRetakes: e.target.value })}
              placeholder="leave blank for unlimited"
              className={fieldClass('maxRetakes', inputBase)}
            />
            {fieldErrors.maxRetakes ? (
              <p className="text-[11px] text-red-600 mt-1">{fieldErrors.maxRetakes}</p>
            ) : (
              <p className="text-[11px] text-grey-50 mt-1">Retakes beyond the first attempt. Leave blank for unlimited.</p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-surface-border pt-3 space-y-2">
        <div className="flex items-center justify-between opacity-60">
          <label className="text-sm text-grey-35">
            Auto-transcribe answers
            <span className="ml-2 text-[11px] uppercase tracking-wide text-grey-40">Coming soon</span>
          </label>
          <button
            disabled
            className="relative inline-flex h-5 w-9 items-center rounded-full bg-gray-300 cursor-not-allowed"
          >
            <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white translate-x-0.5" />
          </button>
        </div>
        <div className="flex items-center justify-between opacity-60">
          <label className="text-sm text-grey-35">
            AI analysis &amp; score
            <span className="ml-2 text-[11px] uppercase tracking-wide text-grey-40">Coming soon</span>
          </label>
          <button
            disabled
            className="relative inline-flex h-5 w-9 items-center rounded-full bg-gray-300 cursor-not-allowed"
          >
            <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
