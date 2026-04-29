/**
 * Candidates — kanban view with user-configurable funnel stages.
 *
 * Stages are stored on Workspace.settings.funnelStages and managed inline via
 * StageSettingsDrawer (gear icon in the page header). Drag-drop writes the
 * stage's id straight into Session.pipelineStatus.
 *
 * Legacy hardcoded statuses (passed, scheduled, training_completed, etc.)
 * still flow into the right default stage via mapLegacyStatusToStageId, so
 * existing candidates render correctly even before the workspace customizes.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge, Card, PageHeader } from '@/components/design'
import {
  DEFAULT_FUNNEL_STAGES,
  type FunnelStage,
  normalizeStages,
  resolveStage,
} from '@/lib/funnel-stages'
import { StageSettingsDrawer } from './_StageSettingsDrawer'

interface Candidate {
  id: string; candidateName: string | null; candidateEmail: string | null; candidatePhone: string | null
  outcome: string | null; pipelineStatus: string | null; startedAt: string; finishedAt: string | null
  source: string | null; answerCount: number; submissionCount: number
  trainingStatus: string | null; trainingCompletedAt: string | null
  schedulingEvents: number; lastSchedulingEvent: string | null
  flow: { id: string; name: string } | null
  ad: { id: string; name: string; source: string } | null
}

interface Flow { id: string; name: string }

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [stages, setStages] = useState<FunnelStage[]>(DEFAULT_FUNNEL_STAGES)
  const [loading, setLoading] = useState(true)
  const [flowFilter, setFlowFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [hoverCol, setHoverCol] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    fetch('/api/flows').then((r) => r.json()).then(setFlows).catch(() => {})
    fetch('/api/workspace/settings')
      .then((r) => r.json())
      .then((d) => {
        const raw = (d?.settings as { funnelStages?: unknown } | null)?.funnelStages
        setStages(normalizeStages(raw))
      })
      .catch(() => {})
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (flowFilter) params.set('flowId', flowFilter)
    if (search) params.set('search', search)
    fetch(`/api/candidates?${params}`).then((r) => r.json()).then((d) => { setCandidates(d); setLoading(false) })
  }, [flowFilter, search])

  useEffect(() => { load() }, [load])

  const updateStatus = async (id: string, pipelineStatus: string) => {
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, pipelineStatus } : c))
    await fetch(`/api/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineStatus }),
    })
  }

  const deleteCandidate = async (c: Candidate) => {
    const name = c.candidateName || c.candidateEmail || 'this candidate'
    if (!confirm(`Delete ${name}? This permanently removes their answers, video submissions, training progress, and scheduled interviews. This cannot be undone.`)) return
    const prev = candidates
    setCandidates((cur) => cur.filter((x) => x.id !== c.id))
    const res = await fetch(`/api/candidates/${c.id}`, { method: 'DELETE' })
    if (!res.ok) {
      setCandidates(prev)
      alert('Failed to delete candidate')
    }
  }

  // Group candidates by resolved stage. Legacy statuses fall through to the
  // mapped default stage; unknown ids go to the first stage.
  const grouped = useMemo(() => {
    const g: Record<string, Candidate[]> = Object.fromEntries(stages.map((s) => [s.id, []]))
    for (const c of candidates) {
      const stage = resolveStage(c.pipelineStatus, stages)
      g[stage.id].push(c)
    }
    return g
  }, [candidates, stages])

  const candidateCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of stages) counts[s.id] = grouped[s.id]?.length ?? 0
    return counts
  }, [grouped, stages])

  return (
    <div className="-mx-6 lg:-mx-[132px]">
      <PageHeader
        eyebrow={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
        title="Candidates"
        description="Drag between columns to move candidates through your pipeline."
        actions={
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] border border-surface-border text-[13px] text-ink hover:bg-surface-light transition-colors"
            title="Manage funnel stages"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Stages
          </button>
        }
      />

      <div className="px-8 py-5">
        {/* Filters */}
        <div className="flex gap-2.5 mb-5">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)}
            onBlur={() => setSearch(searchInput)}
            placeholder="Search by name, email, phone…"
            className="flex-1 max-w-xs px-3 py-2 border border-surface-border rounded-[10px] text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white"
          />
          <select
            value={flowFilter}
            onChange={(e) => setFlowFilter(e.target.value)}
            className="px-3 py-2 border border-surface-border rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            <option value="">All flows</option>
            {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-14 text-center font-mono text-[11px] uppercase text-grey-35" style={{ letterSpacing: '0.1em' }}>Loading…</div>
        ) : candidates.length === 0 ? (
          <Card padding={48} className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-xl flex items-center justify-center">
              <svg className="w-8 h-8" style={{ color: 'var(--brand-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-[20px] font-semibold text-ink mb-2">No candidates yet</h2>
            <p className="text-grey-35 text-[14px]">Candidates will appear here once they start a flow.</p>
          </Card>
        ) : (
          <div className="flex gap-3.5 overflow-x-auto pb-3 -mx-2 px-2 snap-x">
            {stages.map((stage) => {
              const items = grouped[stage.id] ?? []
              const isHover = hoverCol === stage.id
              return (
                <div
                  key={stage.id}
                  onDragOver={(e) => { e.preventDefault(); setHoverCol(stage.id) }}
                  onDragLeave={() => setHoverCol((cur) => (cur === stage.id ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/candidate-id')
                    if (!id) return
                    const current = candidates.find((c) => c.id === id)
                    if (!current) return
                    if (resolveStage(current.pipelineStatus, stages).id === stage.id) {
                      setHoverCol(null); return
                    }
                    updateStatus(id, stage.id)
                    setHoverCol(null)
                  }}
                  className={`shrink-0 w-[300px] snap-start rounded-[14px] border transition-all ${
                    isHover ? 'border-[color:var(--brand-primary)] bg-brand-50/40' : 'border-surface-border bg-white'
                  }`}
                >
                  <div className="px-4 py-3 border-b border-surface-divider flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                      <div className="font-semibold text-[13px] text-ink">{stage.label}</div>
                    </div>
                    <div className="font-mono text-[11px] text-grey-35" style={{ letterSpacing: '0.06em' }}>
                      {items.length}
                    </div>
                  </div>
                  <div className="p-2.5 space-y-2 min-h-[120px]">
                    {items.length === 0 ? (
                      <div className="text-center py-8 font-mono text-[10px] uppercase text-grey-50" style={{ letterSpacing: '0.12em' }}>
                        Drop here
                      </div>
                    ) : items.map((c) => {
                      const cardStage = resolveStage(c.pipelineStatus, stages)
                      const isDragging = dragging === c.id
                      return (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/candidate-id', c.id)
                            e.dataTransfer.effectAllowed = 'move'
                            setDragging(c.id)
                          }}
                          onDragEnd={() => { setDragging(null); setHoverCol(null) }}
                          className={`group rounded-[10px] border border-surface-border bg-white p-3 cursor-grab active:cursor-grabbing transition-shadow ${
                            isDragging ? 'opacity-50' : 'hover:shadow-[0_2px_6px_rgba(26,24,21,0.06)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <Link href={`/dashboard/candidates/${c.id}`} className="font-medium text-[13px] text-ink hover:text-[color:var(--brand-primary)] leading-tight">
                              {c.candidateName || 'Anonymous'}
                            </Link>
                            <Badge tone={cardStage.tone}>{cardStage.label}</Badge>
                          </div>
                          {c.candidateEmail && (
                            <div className="font-mono text-[10px] text-grey-35 truncate mb-1.5" style={{ letterSpacing: '0.02em' }}>
                              {c.candidateEmail}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-2 text-[11px] text-grey-35">
                            {c.flow?.name && (
                              <span className="truncate max-w-[130px]" title={c.flow.name}>{c.flow.name}</span>
                            )}
                            {(c.source || c.ad?.source) && (
                              <>
                                {c.flow?.name && <span className="text-grey-50">·</span>}
                                <span className="capitalize">{c.ad?.source || c.source}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-grey-50" style={{ letterSpacing: '0.04em' }}>
                            <span>{new Date(c.startedAt).toLocaleDateString()}</span>
                            <div className="flex gap-2">
                              {c.answerCount > 0 && <span>{c.answerCount}Q</span>}
                              {c.submissionCount > 0 && <span style={{ color: 'var(--brand-fg)' }}>{c.submissionCount}🎥</span>}
                            </div>
                          </div>
                          {/* Quick move buttons — visible on hover, target every other stage */}
                          <div className="mt-2 pt-2 border-t border-surface-divider flex flex-wrap gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ opacity: isDragging ? 0 : undefined }}>
                            {stages.filter((s) => s.id !== stage.id).map((s) => (
                              <button
                                key={s.id}
                                onClick={() => updateStatus(c.id, s.id)}
                                className="font-mono text-[9px] uppercase px-2 py-1 rounded-[6px] border border-surface-border text-grey-35 hover:text-ink hover:bg-surface-light transition-colors"
                                style={{ letterSpacing: '0.08em' }}
                                title={`Move to ${s.label}`}
                              >
                                → {s.label}
                              </button>
                            ))}
                            <button
                              onClick={() => deleteCandidate(c)}
                              className="font-mono text-[9px] uppercase px-2 py-1 rounded-[6px] border border-red-200 text-red-600 hover:bg-red-50 transition-colors ml-auto"
                              style={{ letterSpacing: '0.08em' }}
                              title="Delete candidate"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <StageSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        stages={stages}
        candidateCounts={candidateCounts}
        onSaved={(next) => {
          setStages(next)
          load()
        }}
      />
    </div>
  )
}
