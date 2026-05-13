'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/design'
import {
  type FunnelStage,
  type StageTrigger,
  type StageTriggerEvent,
  STAGE_TONE_OPTIONS,
  makeStageId,
  normalizeStages,
} from '@/lib/funnel-stages'

interface TargetOption { id: string; label: string }
interface TargetCatalog { flows: TargetOption[]; trainings: TargetOption[] }

const EVENT_LABELS: Record<StageTriggerEvent, string> = {
  flow_passed:        'Flow passed',
  flow_completed:     'Flow completed',
  training_started:   'Training started',
  training_completed: 'Training completed',
  meeting_scheduled:  'Interview scheduled',
  meeting_confirmed:  'Interview confirmed by candidate (SMS)',
  meeting_cancelled:  'Interview cancelled by candidate (SMS)',
  meeting_started:    'Interview started',
  meeting_ended:      'Interview ended',
  meeting_no_show:    'Interview no-show',
  background_check_passed:       'Background check passed',
  background_check_failed:       'Background check failed',
  background_check_needs_review: 'Background check — needs review',
}

function eventTargetKind(event: StageTriggerEvent): 'flow' | 'training' | null {
  if (event.startsWith('flow_')) return 'flow'
  if (event.startsWith('training_')) return 'training'
  return null
}

function describeTrigger(t: StageTrigger, catalog: TargetCatalog | null): string {
  const evt = EVENT_LABELS[t.event] ?? t.event
  const kind = eventTargetKind(t.event)
  if (!kind) return evt
  if (!t.targetId) return `${evt} (any)`
  const list = kind === 'flow' ? catalog?.flows : catalog?.trainings
  const found = list?.find((x) => x.id === t.targetId)
  return `${evt} — ${found?.label ?? t.targetId.slice(0, 6)}`
}

interface Props {
  open: boolean
  onClose: () => void
  // The pipeline whose stages this drawer edits. null means "the caller
  // hasn't loaded pipelines yet" — drawer disables Save in that case.
  // Stages are persisted via PATCH /api/pipelines/[id] (not workspace.settings).
  pipelineId: string | null
  pipelineName?: string
  stages: FunnelStage[]
  candidateCounts: Record<string, number>
  onSaved: (stages: FunnelStage[]) => void
}

type DeleteTarget = { stage: FunnelStage; count: number } | null

export function StageSettingsDrawer({ open, onClose, pipelineId, pipelineName, stages: initial, candidateCounts, onSaved }: Props) {
  const [stages, setStages] = useState<FunnelStage[]>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [reassignTo, setReassignTo] = useState<string>('')
  const [catalog, setCatalog] = useState<TargetCatalog | null>(null)
  const [pickerStageId, setPickerStageId] = useState<string | null>(null)
  const [pickerEvent, setPickerEvent] = useState<StageTriggerEvent>('training_started')
  const [pickerTargetId, setPickerTargetId] = useState<string>('')
  const [backfillPreview, setBackfillPreview] = useState<null | {
    total: number
    byStage: Record<string, number>
  }>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => { setStages(initial) }, [initial, open])

  useEffect(() => {
    if (!open) return
    fetch('/api/funnel-stage-targets', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCatalog({ flows: d.flows ?? [], trainings: d.trainings ?? [] }) })
      .catch(() => {})
  }, [open])

  if (!open) return null

  const updateStage = (id: string, patch: Partial<FunnelStage>) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const addTrigger = (stageId: string, trigger: StageTrigger) => {
    setStages((prev) => prev.map((s) => {
      if (s.id !== stageId) return s
      const next = [...(s.triggers ?? []), trigger]
      // Dedupe identical triggers (same event + target).
      const seen = new Set<string>()
      const deduped = next.filter((t) => {
        const k = `${t.event}|${t.targetId ?? ''}`
        if (seen.has(k)) return false
        seen.add(k); return true
      })
      return { ...s, triggers: deduped }
    }))
  }

  const removeTrigger = (stageId: string, idx: number) => {
    setStages((prev) => prev.map((s) => {
      if (s.id !== stageId) return s
      const triggers = (s.triggers ?? []).filter((_, i) => i !== idx)
      return { ...s, triggers: triggers.length ? triggers : undefined }
    }))
  }

  const openPicker = (stageId: string) => {
    setPickerStageId(stageId)
    setPickerEvent('training_started')
    setPickerTargetId('')
  }
  const closePicker = () => setPickerStageId(null)
  const confirmPicker = () => {
    if (!pickerStageId) return
    const kind = eventTargetKind(pickerEvent)
    addTrigger(pickerStageId, {
      event: pickerEvent,
      ...(kind && pickerTargetId ? { targetId: pickerTargetId } : {}),
    })
    closePicker()
  }

  const addStage = () => {
    const label = `Stage ${stages.length + 1}`
    const id = makeStageId(label, stages)
    setStages((prev) => [
      ...prev,
      { id, label, tone: 'neutral', color: 'var(--neutral-fg)', order: prev.length },
    ])
  }

  const move = (id: string, dir: -1 | 1) => {
    setStages((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      const next = idx + dir
      if (idx < 0 || next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
      return copy.map((s, i) => ({ ...s, order: i }))
    })
  }

  const startDelete = (stage: FunnelStage) => {
    const count = candidateCounts[stage.id] ?? 0
    if (stages.length <= 1) {
      setError('You must have at least one stage')
      return
    }
    if (count === 0) {
      // Hybrid option C — empty stage deletes immediately on confirm.
      if (confirm(`Delete stage "${stage.label}"?`)) {
        setStages((prev) => prev.filter((s) => s.id !== stage.id).map((s, i) => ({ ...s, order: i })))
      }
      return
    }
    // Populated — force pick a target.
    const firstOther = stages.find((s) => s.id !== stage.id)?.id ?? ''
    setReassignTo(firstOther)
    setDeleteTarget({ stage, count })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    if (!reassignTo) { setError('Pick a stage to move candidates to'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/candidates/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromStatus: deleteTarget.stage.id, toStatus: reassignTo }),
      })
      if (!res.ok) throw new Error('Reassign failed')
      setStages((prev) =>
        prev.filter((s) => s.id !== deleteTarget.stage.id).map((s, i) => ({ ...s, order: i })),
      )
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reassign failed')
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (!pipelineId) {
      setError('No pipeline selected')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/pipelines/${pipelineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ stages }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Save failed (${res.status}): ${text.slice(0, 160)}`)
      }
      const body = await res.json().catch(() => ({}))
      const persisted = Array.isArray(body?.stages) ? body.stages : null
      if (!persisted || persisted.length !== stages.length) {
        throw new Error(`Save did not persist (server returned ${persisted ? persisted.length : 'no'} stages)`)
      }
      const saved = normalizeStages(persisted)
      onSaved(saved)
      // After persisting stages, run a dry-run backfill against the saved
      // triggers. If anything would move, surface a confirmation modal so
      // the user can decide whether to re-apply triggers retroactively.
      try {
        const drf = await fetch('/api/funnel-stages/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ commit: false }),
        })
        if (drf.ok) {
          const j = await drf.json()
          if (j.total > 0) {
            setBackfillPreview({ total: j.total, byStage: j.byStage ?? {} })
            return // keep drawer open to show the preview modal
          }
        }
      } catch { /* ignore — settings already saved */ }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const applyBackfill = async () => {
    setApplying(true)
    try {
      await fetch('/api/funnel-stages/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ commit: true }),
      })
      setBackfillPreview(null)
      // Re-fire onSaved so the page re-fetches candidates with their new
      // pipeline_status values. Stages haven't changed since the save, but
      // onSaved triggers a load() on the page side.
      onSaved(stages)
      onClose()
    } catch {
      setError('Re-apply failed')
    } finally {
      setApplying(false)
    }
  }

  const skipBackfill = () => {
    setBackfillPreview(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative ml-auto h-full w-full max-w-[480px] bg-white shadow-xl flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 border-b border-surface-divider flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase text-grey-50" style={{ letterSpacing: '0.1em' }}>Stages · {pipelineName ?? 'Default'}</div>
            <h2 className="font-semibold text-[16px] text-ink truncate">Funnel stages</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-2">
          {stages.map((s, idx) => {
            const count = candidateCounts[s.id] ?? 0
            return (
              <div
                key={s.id}
                className="rounded-[10px] border border-surface-border bg-white p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <input
                    value={s.label}
                    onChange={(e) => updateStage(s.id, { label: e.target.value })}
                    className="flex-1 px-2 py-1.5 border border-surface-border rounded-md text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => move(s.id, -1)}
                      disabled={idx === 0}
                      className="w-7 h-7 flex items-center justify-center text-grey-35 hover:text-ink hover:bg-surface-light rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >↑</button>
                    <button
                      onClick={() => move(s.id, 1)}
                      disabled={idx === stages.length - 1}
                      className="w-7 h-7 flex items-center justify-center text-grey-35 hover:text-ink hover:bg-surface-light rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >↓</button>
                    <button
                      onClick={() => startDelete(s)}
                      className="w-7 h-7 flex items-center justify-center text-[color:var(--danger-fg)] hover:bg-[color:var(--danger-bg)] rounded"
                      title="Delete stage"
                    >×</button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {STAGE_TONE_OPTIONS.map((opt) => (
                      <button
                        key={opt.tone}
                        onClick={() => updateStage(s.id, { tone: opt.tone, color: opt.color })}
                        title={opt.label}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          s.tone === opt.tone ? 'border-ink scale-110' : 'border-transparent'
                        }`}
                        style={{ background: opt.color }}
                      />
                    ))}
                  </div>
                  <div className="font-mono text-[10px] uppercase text-grey-50" style={{ letterSpacing: '0.08em' }}>
                    {count} candidate{count === 1 ? '' : 's'}
                  </div>
                </div>

                {/* Triggers — system events that auto-place candidates here */}
                <div className="mt-3 pt-3 border-t border-surface-divider">
                  <div className="font-mono text-[9px] uppercase text-grey-50 mb-2" style={{ letterSpacing: '0.1em' }}>
                    Auto-move when…
                  </div>
                  {(s.triggers ?? []).length === 0 ? (
                    <div className="text-[11px] text-grey-50 mb-2">No triggers — only manual moves.</div>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {(s.triggers ?? []).map((t, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 bg-surface-light rounded-md px-2 py-1">
                          <span className="text-[11px] text-ink truncate">{describeTrigger(t, catalog)}</span>
                          <button
                            onClick={() => removeTrigger(s.id, i)}
                            className="shrink-0 text-grey-35 hover:text-[color:var(--danger-fg)] text-[12px] w-5 h-5 flex items-center justify-center"
                            title="Remove trigger"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => openPicker(s.id)}
                    className="text-[11px] text-grey-35 hover:text-ink underline-offset-2 hover:underline"
                  >
                    + Add trigger
                  </button>
                </div>
              </div>
            )
          })}

          <button
            onClick={addStage}
            className="w-full py-2.5 rounded-[10px] border border-dashed border-surface-border text-[13px] text-grey-35 hover:text-ink hover:border-ink/40 hover:bg-surface-light transition-colors"
          >
            + Add stage
          </button>
        </div>

        {error && (
          <div className="shrink-0 mx-5 mb-3 px-3 py-2 rounded-md text-[12px] text-[color:var(--danger-fg)] bg-[color:var(--danger-bg)]">
            {error}
          </div>
        )}

        {pickerStageId && (() => {
          const kind = eventTargetKind(pickerEvent)
          const targetList = kind === 'flow' ? catalog?.flows : kind === 'training' ? catalog?.trainings : null
          return (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-5">
              <div className="bg-white rounded-[12px] shadow-xl w-full max-w-[400px] p-5">
                <h3 className="font-semibold text-[15px] text-ink mb-3">Add trigger</h3>
                <label className="block text-[11px] font-mono uppercase text-grey-50 mb-1.5" style={{ letterSpacing: '0.08em' }}>Event</label>
                <select
                  value={pickerEvent}
                  onChange={(e) => { setPickerEvent(e.target.value as StageTriggerEvent); setPickerTargetId('') }}
                  className="w-full px-3 py-2 border border-surface-border rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 mb-3"
                >
                  {(Object.keys(EVENT_LABELS) as StageTriggerEvent[]).map((ev) => (
                    <option key={ev} value={ev}>{EVENT_LABELS[ev]}</option>
                  ))}
                </select>
                {kind && (
                  <>
                    <label className="block text-[11px] font-mono uppercase text-grey-50 mb-1.5" style={{ letterSpacing: '0.08em' }}>
                      {kind === 'flow' ? 'Flow' : 'Training'}
                    </label>
                    <select
                      value={pickerTargetId}
                      onChange={(e) => setPickerTargetId(e.target.value)}
                      className="w-full px-3 py-2 border border-surface-border rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 mb-4"
                    >
                      <option value="">Any {kind}</option>
                      {(targetList ?? []).map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </>
                )}
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="ghost" onClick={closePicker}>Cancel</Button>
                  <Button variant="primary" onClick={confirmPicker}>Add</Button>
                </div>
              </div>
            </div>
          )
        })()}

        {backfillPreview && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-5">
            <div className="bg-white rounded-[12px] shadow-xl w-full max-w-[420px] p-5">
              <h3 className="font-semibold text-[15px] text-ink mb-1">
                Re-apply triggers to existing candidates?
              </h3>
              <p className="text-[13px] text-grey-35 mb-3">
                Based on your saved triggers, {backfillPreview.total} candidate{backfillPreview.total === 1 ? '' : 's'} would move:
              </p>
              <div className="space-y-1 mb-4 max-h-[200px] overflow-y-auto">
                {Object.entries(backfillPreview.byStage).map(([stageId, count]) => {
                  const stage = stages.find((s) => s.id === stageId)
                  return (
                    <div key={stageId} className="flex items-center justify-between bg-surface-light rounded-md px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: stage?.color ?? 'var(--neutral-fg)' }} />
                        <span className="text-[12px] text-ink">{stage?.label ?? stageId}</span>
                      </div>
                      <span className="font-mono text-[11px] text-grey-35">{count}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-grey-50 mb-3">
                Skipping leaves existing candidates where they are; future events will still auto-move them.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={skipBackfill} disabled={applying}>Skip</Button>
                <Button variant="primary" onClick={applyBackfill} disabled={applying}>
                  {applying ? 'Applying…' : 'Re-apply'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-5">
            <div className="bg-white rounded-[12px] shadow-xl w-full max-w-[400px] p-5">
              <h3 className="font-semibold text-[15px] text-ink mb-1">
                Delete &ldquo;{deleteTarget.stage.label}&rdquo;?
              </h3>
              <p className="text-[13px] text-grey-35 mb-4">
                {deleteTarget.count} candidate{deleteTarget.count === 1 ? '' : 's'} {deleteTarget.count === 1 ? 'is' : 'are'} in this stage. Move them to:
              </p>
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="w-full px-3 py-2 border border-surface-border rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 mb-4"
              >
                {stages.filter((s) => s.id !== deleteTarget.stage.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancel</Button>
                <Button variant="primary" onClick={confirmDelete} disabled={saving}>
                  {saving ? 'Moving…' : `Move & delete`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
