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
import {
  STATUS_DISPLAY,
  DISPOSITION_DISPLAY,
  type CandidateStatus,
  type CandidateDispositionReason,
} from '@/lib/candidate-status'
import { StageSettingsDrawer } from './_StageSettingsDrawer'

interface Candidate {
  id: string; candidateName: string | null; candidateEmail: string | null; candidatePhone: string | null
  outcome: string | null; pipelineStatus: string | null; rejectionReason: string | null
  status: CandidateStatus | null
  dispositionReason: CandidateDispositionReason | null
  stalledAt: string | null; lostAt: string | null; hiredAt: string | null
  startedAt: string; finishedAt: string | null
  source: string | null; answerCount: number; submissionCount: number
  trainingStatus: string | null; trainingCompletedAt: string | null
  schedulingEvents: number; lastSchedulingEvent: string | null
  flow: { id: string; name: string } | null
  ad: { id: string; name: string; source: string } | null
  isRebook?: boolean
  nextMeetingAt?: string | null
}

// Status tabs above the kanban. The "Active" tab — the default view —
// includes both 'active' and 'waiting' so candidates parked waiting for an
// external action (e.g. a training to be scheduled) still show up. "All"
// disables the filter entirely. Order roughly mirrors the candidate
// lifecycle so recruiters can scan left to right. Each tab carries its
// own accent color (matching the status tone vocabulary) so the row reads
// as a colored legend at a glance.
const STATUS_TABS: Array<{ key: string; label: string; statuses: CandidateStatus[] | null; color: string }> = [
  { key: 'active',  label: 'Active',  statuses: ['active', 'waiting'], color: 'var(--brand-primary)' },
  { key: 'stalled', label: 'Stalled', statuses: ['stalled'],            color: '#D97706'             },
  { key: 'nurture', label: 'Nurture', statuses: ['nurture'],            color: 'var(--neutral-fg)'   },
  { key: 'hired',   label: 'Hired',   statuses: ['hired'],              color: 'var(--success-fg)'   },
  { key: 'lost',    label: 'Lost',    statuses: ['lost'],               color: 'var(--danger-fg)'    },
  { key: 'all',     label: 'All',     statuses: null,                   color: 'var(--neutral-fg)'   },
]

// Background tint for the disposition pill, keyed by the candidate's
// current status. Pulls the existing rejection-pill (red) and adds amber
// for stalled — same color vocabulary as the funnel stage tones.
const DISPOSITION_TINT: Partial<Record<CandidateStatus, { bg: string; text: string; border: string }>> = {
  stalled: { bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-200' },
  lost:    { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200'   },
  hired:   { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  nurture: { bg: 'bg-surface-light', text: 'text-grey-15', border: 'border-surface-border' },
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!isFinite(ms) || ms < 0) return null
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

interface Flow { id: string; name: string }

const STAGE_SORT_KEY = 'hiringflow:kanban-stage-sorts'

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
  // Per-stage sort direction. 'asc' = oldest first (FIFO follow-up — the
  // current default), 'desc' = newest first. Persisted in localStorage so
  // the choice survives page reloads. Stages without an entry default to asc.
  const [stageSorts, setStageSorts] = useState<Record<string, 'asc' | 'desc'>>({})
  // Status tab — controls which candidates render on the board. Default is
  // 'active', which the API maps to status IN ('active','waiting'). 'all'
  // disables the filter. Persisted in localStorage so the tab survives
  // refreshes (recruiters who live on the Stalled tab get to keep it).
  const [statusTab, setStatusTab] = useState<string>('active')
  const [statusCounts, setStatusCounts] = useState<Record<CandidateStatus, number>>({
    active: 0, waiting: 0, stalled: 0, nurture: 0, lost: 0, hired: 0,
  })
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

  // Auto-scroll the board horizontally while a card is being dragged near
  // (or past) either edge. Native HTML5 drag won't pan the container on its
  // own, so we track the cursor via `drag` + `dragover` and bump scrollLeft
  // each frame.
  //
  // Why disable scroll-snap during the drag: the kanban has `snap-x` and
  // each column has `snap-start`. With snap on, every programmatic
  // scrollLeft write was getting reverted back to the previous snap point,
  // so the board never actually moved. Restoring snap on dragend.
  useEffect(() => {
    if (!dragging) return
    const el = kanbanRef.current
    if (!el) return
    const prevSnap = el.style.scrollSnapType
    el.style.scrollSnapType = 'none'
    let pointerX = -1
    let raf = 0
    const EDGE = 140
    const MAX_SPEED = 32
    const onMove = (ev: DragEvent) => {
      if (ev.clientX === 0 && ev.clientY === 0) return
      pointerX = ev.clientX
    }
    const tick = () => {
      if (pointerX >= 0) {
        const rect = el.getBoundingClientRect()
        const distLeft = pointerX - rect.left
        const distRight = rect.right - pointerX
        if (distLeft < EDGE) {
          const factor = Math.min(1, Math.max(0, 1 - distLeft / EDGE))
          el.scrollLeft -= MAX_SPEED * factor
        } else if (distRight < EDGE) {
          const factor = Math.min(1, Math.max(0, 1 - distRight / EDGE))
          el.scrollLeft += MAX_SPEED * factor
        }
      }
      raf = requestAnimationFrame(tick)
    }
    // Safety net: if the dragged card unmounts mid-drag (e.g. after drop the
    // card moves columns and React swaps DOM nodes), its onDragEnd never
    // fires. A window-level dragend reliably clears the state.
    const onDragEnd = () => { setDragging(null); setHoverCol(null); setSelectedCard(null) }
    window.addEventListener('dragover', onMove, true)
    window.addEventListener('drag', onMove, true)
    window.addEventListener('dragend', onDragEnd, true)
    window.addEventListener('drop', onDragEnd, true)
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('dragover', onMove, true)
      window.removeEventListener('drag', onMove, true)
      window.removeEventListener('dragend', onDragEnd, true)
      window.removeEventListener('drop', onDragEnd, true)
      cancelAnimationFrame(raf)
      el.style.scrollSnapType = prevSnap
    }
  }, [dragging])

  useEffect(() => {
    fetch('/api/flows').then((r) => r.json()).then(setFlows).catch(() => {})
    fetch('/api/workspace/settings')
      .then((r) => r.json())
      .then((d) => {
        const raw = (d?.settings as { funnelStages?: unknown } | null)?.funnelStages
        setStages(normalizeStages(raw))
      })
      .catch(() => {})
    // Restore per-stage sort prefs from prior visits.
    try {
      const raw = localStorage.getItem(STAGE_SORT_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const cleaned: Record<string, 'asc' | 'desc'> = {}
        for (const [k, v] of Object.entries(parsed)) {
          if (v === 'asc' || v === 'desc') cleaned[k] = v
        }
        setStageSorts(cleaned)
      }
    } catch {}
    try {
      const raw = localStorage.getItem('hiringflow:status-tab')
      if (raw && STATUS_TABS.some((t) => t.key === raw)) setStatusTab(raw)
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('hiringflow:status-tab', statusTab) } catch {}
  }, [statusTab])

  const setStageSort = (stageId: string, direction: 'asc' | 'desc') => {
    setStageSorts((cur) => {
      const next = { ...cur, [stageId]: direction }
      try { localStorage.setItem(STAGE_SORT_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const load = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    const params = new URLSearchParams()
    if (flowFilter) params.set('flowId', flowFilter)
    if (search) params.set('search', search)
    const tab = STATUS_TABS.find((t) => t.key === statusTab)
    if (tab && tab.statuses) params.set('candidateStatus', tab.statuses.join(','))
    fetch(`/api/candidates?${params}`)
      .then((r) => r.json())
      .then((d: Candidate[]) => { setCandidates(d); setLoading(false) })

    // Counts for the tab pills — fetched separately with the SAME flow /
    // search filters but no status filter, then bucketed client-side.
    // Keeps every tab's badge accurate regardless of which tab is active.
    const countParams = new URLSearchParams()
    if (flowFilter) countParams.set('flowId', flowFilter)
    if (search) countParams.set('search', search)
    fetch(`/api/candidates?${countParams}`)
      .then((r) => r.json())
      .then((all: Candidate[]) => {
        const buckets: Record<CandidateStatus, number> = {
          active: 0, waiting: 0, stalled: 0, nurture: 0, lost: 0, hired: 0,
        }
        for (const c of all) {
          const s = (c.status ?? 'active') as CandidateStatus
          if (s in buckets) buckets[s] += 1
        }
        setStatusCounts(buckets)
      })
      .catch(() => {})
  }, [flowFilter, search, statusTab])

  useEffect(() => { load() }, [load])

  // Auto-refresh: pick up server-side stage changes (meeting_ended,
  // recording_ready, etc.) without requiring the recruiter to hard-refresh.
  // Polls every 30s while the tab is visible and refetches instantly on
  // focus. Skipped while a card is mid-drag so the optimistic update isn't
  // clobbered.
  const draggingRef = useRef(false)
  useEffect(() => { draggingRef.current = dragging !== null }, [dragging])
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (draggingRef.current) return
      load({ silent: true })
    }
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    const id = window.setInterval(tick, 30_000)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

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
  // mapped default stage; unknown ids go to the first stage. Within each
  // column, candidates with an upcoming meeting always come first (soonest
  // first) so urgent interviews stay on top regardless of sort direction;
  // the rest are ordered by Session.startedAt per the per-stage preference
  // (default asc = oldest applied first).
  const grouped = useMemo(() => {
    const g: Record<string, Candidate[]> = Object.fromEntries(stages.map((s) => [s.id, []]))
    for (const c of candidates) {
      const stage = resolveStage(c.pipelineStatus, stages)
      g[stage.id].push(c)
    }
    for (const id of Object.keys(g)) {
      const dir = stageSorts[id] ?? 'asc'
      const mult = dir === 'desc' ? -1 : 1
      g[id].sort((a, b) => {
        const ma = a.nextMeetingAt ? new Date(a.nextMeetingAt).getTime() : null
        const mb = b.nextMeetingAt ? new Date(b.nextMeetingAt).getTime() : null
        if (ma !== null && mb !== null) return ma - mb
        if (ma !== null) return -1
        if (mb !== null) return 1
        return mult * (new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      })
    }
    return g
  }, [candidates, stages, stageSorts])

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
        {/* Status tabs — orthogonal to the funnel stages. Default 'Active'
            hides stalled/lost/nurture/hired so the board only shows
            candidates currently in motion. Counts come from the count
            fetch in load() so they always reflect totals across tabs. */}
        <div data-no-pan className="shrink-0 flex gap-1 mb-3 overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const isActive = statusTab === tab.key
            const count = tab.statuses
              ? tab.statuses.reduce((s, k) => s + (statusCounts[k] ?? 0), 0)
              : Object.values(statusCounts).reduce((s, v) => s + v, 0)
            return (
              <button
                key={tab.key}
                onClick={() => setStatusTab(tab.key)}
                style={isActive ? { background: tab.color, borderColor: tab.color } : undefined}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium transition-colors ${
                  isActive
                    ? 'text-white'
                    : 'bg-white text-grey-35 border-surface-border hover:border-grey-50 hover:text-ink'
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: isActive ? 'rgba(255,255,255,0.85)' : tab.color }}
                />
                {tab.label}
                <span className={`font-mono text-[10px] tabular-nums ${isActive ? 'text-white/80' : 'text-grey-50'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

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
                    // Clear drag state here too — when the card is moved to a
                    // different column the source DOM node unmounts and its
                    // onDragEnd may not fire, leaving `dragging` stuck.
                    setHoverCol(null)
                    setDragging(null)
                    setSelectedCard(null)
                    if (!id) return
                    const current = candidates.find((c) => c.id === id)
                    if (!current) return
                    if (resolveStage(current.pipelineStatus, stages).id === stage.id) return
                    updateStatus(id, stage.id)
                  }}
                  className={`shrink-0 w-[300px] h-full snap-start rounded-[14px] border transition-all flex flex-col ${
                    isHover ? 'border-[color:var(--brand-primary)] bg-brand-50/40' : 'border-surface-border bg-white'
                  }`}
                >
                  <div className="shrink-0 px-4 py-3 border-b border-surface-divider flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
                      <div className="font-semibold text-[13px] text-ink truncate">{stage.label}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(() => {
                        const dir = stageSorts[stage.id] ?? 'asc'
                        const next: 'asc' | 'desc' = dir === 'asc' ? 'desc' : 'asc'
                        const label = dir === 'asc' ? 'Oldest first' : 'Newest first'
                        return (
                          <button
                            data-no-pan
                            onClick={(e) => { e.stopPropagation(); setStageSort(stage.id, next) }}
                            onMouseDown={(e) => e.stopPropagation()}
                            title={`Sort by date applied: ${label}. Click to switch.`}
                            aria-label={`Toggle sort direction (currently ${label})`}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-grey-35 hover:bg-surface-light hover:text-ink"
                          >
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              {dir === 'asc' ? (
                                <>
                                  <path d="M4 4h7" />
                                  <path d="M4 8h5" />
                                  <path d="M4 12h3" />
                                  <path d="M12 4v8" />
                                  <path d="M14 10l-2 2-2-2" />
                                </>
                              ) : (
                                <>
                                  <path d="M4 4h3" />
                                  <path d="M4 8h5" />
                                  <path d="M4 12h7" />
                                  <path d="M12 12V4" />
                                  <path d="M14 6l-2-2-2 2" />
                                </>
                              )}
                            </svg>
                          </button>
                        )
                      })()}
                      <div className="font-mono text-[11px] text-grey-35" style={{ letterSpacing: '0.06em' }}>
                        {items.length}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                    {items.length === 0 ? (
                      <div className="text-center py-8 font-mono text-[10px] uppercase text-grey-50" style={{ letterSpacing: '0.12em' }}>
                        Drop here
                      </div>
                    ) : items.map((c) => {
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
                          }`}
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
                            {/* Status badge replaces the stage badge here —
                                the kanban column already labels the stage,
                                so showing it on every card is redundant.
                                Days-since indicator: stalled/lost/hired use
                                their lifecycle stamp; active/waiting/nurture
                                fall back to the application date so the
                                badge is uniformly "<status> · <days>d". */}
                            {(() => {
                              const status = (c.status ?? 'active') as CandidateStatus
                              const meta = STATUS_DISPLAY[status]
                              const stamp = status === 'stalled' ? c.stalledAt
                                : status === 'lost' ? c.lostAt
                                : status === 'hired' ? c.hiredAt
                                : c.startedAt
                              const days = daysSince(stamp)
                              return (
                                <Badge tone={meta.tone}>
                                  {meta.label}{days !== null ? ` · ${days}d` : ''}
                                </Badge>
                              )
                            })()}
                            {/* Structured disposition reason — uses humanized
                                label from DISPOSITION_DISPLAY. Tinted by
                                the candidate's current status so stalled
                                reasons read amber and lost reasons red,
                                consistent with the status badge palette. */}
                            {c.dispositionReason && DISPOSITION_DISPLAY[c.dispositionReason] && (() => {
                              const tint = DISPOSITION_TINT[(c.status ?? 'active') as CandidateStatus]
                                ?? { bg: 'bg-surface-light', text: 'text-grey-15', border: 'border-surface-border' }
                              return (
                                <span
                                  title={`Disposition: ${DISPOSITION_DISPLAY[c.dispositionReason]}`}
                                  className={`inline-flex items-center max-w-[160px] truncate text-[10px] px-2 py-0.5 rounded-full font-medium border ${tint.bg} ${tint.text} ${tint.border}`}
                                >
                                  {DISPOSITION_DISPLAY[c.dispositionReason]}
                                </span>
                              )
                            })()}
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
