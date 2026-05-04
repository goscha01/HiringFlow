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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge, Button, Card, PageHeader } from '@/components/design'
import {
  DEFAULT_FUNNEL_STAGES,
  type FunnelStage,
  normalizeStages,
  resolveStage,
} from '@/lib/funnel-stages'
import { StageSettingsDrawer } from './_StageSettingsDrawer'

interface Candidate {
  id: string; candidateName: string | null; candidateEmail: string | null; candidatePhone: string | null
  outcome: string | null; pipelineStatus: string | null; rejectionReason: string | null
  startedAt: string; finishedAt: string | null
  source: string | null; answerCount: number; submissionCount: number
  trainingStatus: string | null; trainingCompletedAt: string | null
  schedulingEvents: number; lastSchedulingEvent: string | null
  flow: { id: string; name: string } | null
  ad: { id: string; name: string; source: string } | null
  isRebook?: boolean
  nextMeetingAt?: string | null
}

interface Flow { id: string; name: string }

export default function CandidatesPage() {
  const router = useRouter()
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
  const [createOpen, setCreateOpen] = useState(false)
  // A card must be explicitly clicked ("picked up") before its drag handle
  // activates. Until then the card is treated as part of the board so the
  // mousedown initiates a horizontal pan instead of an HTML5 drag.
  const [selectedCard, setSelectedCard] = useState<string | null>(null)

  // Click-and-drag horizontal pan on the kanban background. Skips when the
  // mousedown originates on a *selected* card (data-card is set conditionally)
  // or any interactive element so card DnD and buttons keep working.
  const kanbanRef = useRef<HTMLDivElement | null>(null)
  const panState = useRef<{ startX: number; startScroll: number } | null>(null)
  const movedDuringPan = useRef(false)
  const [panning, setPanning] = useState(false)

  const onPanMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('[data-card], button, a, input, select, textarea, [data-no-pan]')) return
    const el = kanbanRef.current
    if (!el) return
    panState.current = { startX: e.clientX, startScroll: el.scrollLeft }
    movedDuringPan.current = false
    setPanning(true)
  }

  useEffect(() => {
    if (!panning) return
    const onMove = (ev: MouseEvent) => {
      const el = kanbanRef.current
      const ps = panState.current
      if (!el || !ps) return
      if (Math.abs(ev.clientX - ps.startX) > 3) movedDuringPan.current = true
      el.scrollLeft = ps.startScroll - (ev.clientX - ps.startX)
    }
    const onUp = () => { panState.current = null; setPanning(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [panning])

  // Esc cancels the current pickup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedCard(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
  // mapped default stage; unknown ids go to the first stage. Sort each column
  // chronologically: soonest upcoming meeting first (so "Interview scheduled"
  // surfaces what's about to happen), then candidates without a meeting in
  // applied-date order (oldest first, FIFO follow-up).
  const grouped = useMemo(() => {
    const g: Record<string, Candidate[]> = Object.fromEntries(stages.map((s) => [s.id, []]))
    for (const c of candidates) {
      const stage = resolveStage(c.pipelineStatus, stages)
      g[stage.id].push(c)
    }
    for (const id of Object.keys(g)) {
      g[id].sort((a, b) => {
        const ma = a.nextMeetingAt ? new Date(a.nextMeetingAt).getTime() : null
        const mb = b.nextMeetingAt ? new Date(b.nextMeetingAt).getTime() : null
        if (ma !== null && mb !== null) return ma - mb
        if (ma !== null) return -1
        if (mb !== null) return 1
        return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
      })
    }
    return g
  }, [candidates, stages])

  const candidateCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of stages) counts[s.id] = grouped[s.id]?.length ?? 0
    return counts
  }, [grouped, stages])

  return (
    <div className="-mx-6 lg:-mx-[132px] -my-6 md:-my-8 flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      <PageHeader
        eyebrow={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
        title="Candidates"
        description="Drag the board to scroll. Click a candidate to pick it up, then drag to a new stage."
        actions={
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-brand-500 text-white font-semibold text-[13px] hover:bg-brand-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New candidate
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 flex flex-col px-8 py-5">
        {/* Filters */}
        <div className="shrink-0 flex gap-2.5 mb-5">
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
          <div
            ref={kanbanRef}
            onMouseDown={onPanMouseDown}
            onClick={(e) => {
              // Drop the pickup on a real background click — but not when the
              // click is the tail of a pan gesture (mouse moved before mouseup).
              if (movedDuringPan.current) { movedDuringPan.current = false; return }
              const t = e.target as HTMLElement
              if (t.closest('[data-card-body]')) return
              setSelectedCard(null)
            }}
            className={`flex-1 min-h-0 flex gap-3.5 overflow-x-auto overflow-y-hidden -mx-2 px-2 snap-x select-none transition-[opacity,filter] duration-150 ${
              panning
                ? 'cursor-grabbing [&_*]:!cursor-grabbing opacity-80 brightness-90'
                : 'cursor-grab'
            }`}
          >
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
                  className={`shrink-0 w-[300px] h-full snap-start rounded-[14px] border transition-all flex flex-col ${
                    isHover ? 'border-[color:var(--brand-primary)] bg-brand-50/40' : 'border-surface-border bg-white'
                  }`}
                >
                  <div className="shrink-0 px-4 py-3 border-b border-surface-divider flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                      <div className="font-semibold text-[13px] text-ink">{stage.label}</div>
                    </div>
                    <div className="font-mono text-[11px] text-grey-35" style={{ letterSpacing: '0.06em' }}>
                      {items.length}
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                    {items.length === 0 ? (
                      <div className="text-center py-8 font-mono text-[10px] uppercase text-grey-50" style={{ letterSpacing: '0.12em' }}>
                        Drop here
                      </div>
                    ) : items.map((c) => {
                      const cardStage = resolveStage(c.pipelineStatus, stages)
                      const isDragging = dragging === c.id
                      const isSelected = selectedCard === c.id
                      return (
                        <div
                          key={c.id}
                          data-card-body
                          {...(isSelected ? { draggable: true, 'data-card': true } : {})}
                          onClick={(e) => {
                            const t = e.target as HTMLElement
                            if (t.closest('a, button')) return
                            setSelectedCard((cur) => (cur === c.id ? null : c.id))
                          }}
                          onDragStart={(e) => {
                            if (!isSelected) { e.preventDefault(); return }
                            e.dataTransfer.setData('text/candidate-id', c.id)
                            e.dataTransfer.effectAllowed = 'move'
                            setDragging(c.id)
                          }}
                          onDragEnd={() => { setDragging(null); setHoverCol(null); setSelectedCard(null) }}
                          className={`group relative rounded-[10px] border bg-white p-3 transition-shadow ${
                            isSelected
                              ? 'border-[color:var(--brand-primary)] ring-2 ring-[color:var(--brand-primary)]/40 shadow-[0_4px_12px_rgba(255,149,0,0.18)] cursor-grab active:cursor-grabbing'
                              : 'border-surface-border cursor-pointer hover:shadow-[0_2px_6px_rgba(26,24,21,0.06)]'
                          } ${isDragging ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <Link href={`/dashboard/candidates/${c.id}`} className="font-medium text-[13px] text-ink hover:text-[color:var(--brand-primary)] leading-tight pr-6">
                              {c.candidateName || 'Anonymous'}
                            </Link>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteCandidate(c) }}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md text-grey-50 hover:text-[color:var(--danger-fg)] hover:bg-[color:var(--danger-bg)] opacity-0 group-hover:opacity-100 transition-all text-[14px] leading-none"
                              title="Delete candidate"
                              aria-label="Delete candidate"
                            >
                              ×
                            </button>
                          </div>
                          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                            <Badge tone={cardStage.tone}>{cardStage.label}</Badge>
                            {c.isRebook && (
                              <span
                                title="This candidate had a prior no-show and re-booked via the follow-up invite"
                                className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium"
                              >
                                Rebook
                              </span>
                            )}
                            {c.rejectionReason && (
                              <span
                                title={c.rejectionReason}
                                className="inline-flex items-center max-w-[150px] truncate text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium"
                              >
                                {c.rejectionReason}
                              </span>
                            )}
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
                          {c.nextMeetingAt && (
                            <div className="mb-2 text-[11px] text-grey-15">
                              <span className="text-grey-40">Interview:</span>{' '}
                              <span className="font-medium">
                                {new Date(c.nextMeetingAt).toLocaleString(undefined, {
                                  weekday: 'short', month: 'short', day: 'numeric',
                                  hour: 'numeric', minute: '2-digit',
                                })}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[10px] font-mono text-grey-50" style={{ letterSpacing: '0.04em' }}>
                            <span>Applied {new Date(c.startedAt).toLocaleDateString()}</span>
                            <div className="flex gap-2">
                              {c.answerCount > 0 && <span>{c.answerCount}Q</span>}
                              {c.submissionCount > 0 && <span style={{ color: 'var(--brand-fg)' }}>{c.submissionCount}🎥</span>}
                            </div>
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

      <NewCandidateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        flows={flows}
        stages={stages}
        defaultFlowId={flowFilter || flows[0]?.id || ''}
        onCreated={(id) => {
          setCreateOpen(false)
          load()
          router.push(`/dashboard/candidates/${id}`)
        }}
      />
    </div>
  )
}

interface NewCandidateModalProps {
  open: boolean
  onClose: () => void
  flows: Flow[]
  stages: FunnelStage[]
  defaultFlowId: string
  onCreated: (id: string) => void
}

function NewCandidateModal({ open, onClose, flows, stages, defaultFlowId, onCreated }: NewCandidateModalProps) {
  const [flowId, setFlowId] = useState(defaultFlowId)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [stageId, setStageId] = useState(stages[0]?.id ?? 'new')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFlowId(defaultFlowId)
    setName('')
    setEmail('')
    setPhone('')
    setStageId(stages[0]?.id ?? 'new')
    setError(null)
  }, [open, defaultFlowId, stages])

  if (!open) return null

  const canSubmit = !!flowId && (name.trim() || email.trim() || phone.trim())

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flowId,
          candidateName: name,
          candidateEmail: email,
          candidatePhone: phone,
          pipelineStatus: stageId,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'Failed to create candidate')
      }
      const j = await res.json()
      onCreated(j.id as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create candidate')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-[14px] bg-white shadow-xl border border-surface-border"
      >
        <div className="px-5 py-4 border-b border-surface-divider flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Add candidate</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-grey-50 hover:text-ink hover:bg-surface-light"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5">
          {flows.length === 0 ? (
            <div className="text-[13px] text-grey-35">
              You need at least one flow before adding a candidate.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[12px] font-medium text-ink mb-1">Flow</label>
                <select
                  value={flowId}
                  onChange={(e) => setFlowId(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-border rounded-[10px] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  required
                >
                  {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full px-3 py-2 border border-surface-border rounded-[10px] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full px-3 py-2 border border-surface-border rounded-[10px] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                  className="w-full px-3 py-2 border border-surface-border rounded-[10px] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink mb-1">Stage</label>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-border rounded-[10px] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              <p className="text-[11px] text-grey-35">
                At least one of name, email, or phone is required.
              </p>
            </>
          )}

          {error && (
            <div className="text-[12px] px-3 py-2 rounded-[8px] bg-[color:var(--danger-bg)] text-[color:var(--danger-fg)]">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-surface-divider flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={!canSubmit || submitting || flows.length === 0}>
            {submitting ? 'Adding…' : 'Add candidate'}
          </Button>
        </div>
      </form>
    </div>
  )
}
