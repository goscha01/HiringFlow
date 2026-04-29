'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/design'
import {
  type FunnelStage,
  STAGE_TONE_OPTIONS,
  makeStageId,
  normalizeStages,
} from '@/lib/funnel-stages'

interface Props {
  open: boolean
  onClose: () => void
  stages: FunnelStage[]
  candidateCounts: Record<string, number>
  onSaved: (stages: FunnelStage[]) => void
}

type DeleteTarget = { stage: FunnelStage; count: number } | null

export function StageSettingsDrawer({ open, onClose, stages: initial, candidateCounts, onSaved }: Props) {
  const [stages, setStages] = useState<FunnelStage[]>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [reassignTo, setReassignTo] = useState<string>('')

  useEffect(() => { setStages(initial) }, [initial, open])

  if (!open) return null

  const updateStage = (id: string, patch: Partial<FunnelStage>) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
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
    setSaving(true)
    setError(null)
    try {
      // Read current settings first so we don't clobber unrelated keys
      // (e.g. elevenlabs_agent_id). Tolerate non-OK GETs by treating as empty.
      let currentSettings: Record<string, unknown> = {}
      try {
        const getRes = await fetch('/api/workspace/settings', { credentials: 'same-origin' })
        if (getRes.ok) {
          const j = await getRes.json()
          if (j && typeof j.settings === 'object' && j.settings) currentSettings = j.settings
        }
      } catch { /* fall through */ }

      const merged = { ...currentSettings, funnelStages: stages }
      const res = await fetch('/api/workspace/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ settings: merged }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Save failed (${res.status}): ${text.slice(0, 160)}`)
      }
      // Verify the round-trip — re-read settings and confirm funnelStages persisted.
      const verify = await fetch('/api/workspace/settings', { credentials: 'same-origin', cache: 'no-store' })
      const verifyJson = verify.ok ? await verify.json() : null
      const persisted = verifyJson?.settings?.funnelStages
      if (!Array.isArray(persisted) || persisted.length !== stages.length) {
        throw new Error(`Save did not persist (server returned ${Array.isArray(persisted) ? persisted.length : 'no'} stages)`)
      }
      onSaved(normalizeStages(persisted))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
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
            <div className="font-mono text-[10px] uppercase text-grey-50" style={{ letterSpacing: '0.1em' }}>Settings</div>
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
