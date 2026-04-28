/**
 * Candidates — kanban view per design handoff. 4 columns mapped from the
 * existing 9 pipeline stages:
 *
 *   New          ← no pipelineStatus, 'applied'
 *   In progress  ← completed_flow, passed, training_in_progress,
 *                  training_completed, invited_to_schedule, scheduled
 *   Hired        ← pipelineStatus === 'hired' (new terminal value the
 *                  user moves candidates to)
 *   Rejected     ← 'failed', 'rejected'
 *
 * Drag-drop (native HTML5 API — no third-party lib) moves a candidate
 * between columns and patches /api/candidates/:id with a column-default
 * pipelineStatus. The column buttons show the full stage detail on the
 * card so moving a card doesn't lose granularity.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge, Card, Eyebrow, PageHeader, type BadgeTone } from '@/components/design'

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

type Column = 'new' | 'in_progress' | 'hired' | 'rejected'

const COLUMN_ORDER: Column[] = ['new', 'in_progress', 'hired', 'rejected']

const COLUMN_META: Record<Column, { label: string; tone: BadgeTone; defaultStatus: string; accentColor: string }> = {
  new:         { label: 'New',         tone: 'neutral', defaultStatus: 'applied',  accentColor: 'var(--neutral-fg)' },
  in_progress: { label: 'In progress', tone: 'brand',   defaultStatus: 'passed',   accentColor: 'var(--brand-primary)' },
  hired:       { label: 'Hired',       tone: 'success', defaultStatus: 'hired',    accentColor: 'var(--success-fg)' },
  rejected:    { label: 'Rejected',    tone: 'danger',  defaultStatus: 'rejected', accentColor: 'var(--danger-fg)' },
}

function stageToColumn(status: string | null): Column {
  if (!status || status === 'applied') return 'new'
  if (status === 'hired') return 'hired'
  if (status === 'failed' || status === 'rejected') return 'rejected'
  return 'in_progress'
}

// Human-readable label for the raw pipeline stage, rendered inside the card.
const STAGE_LABELS: Record<string, string> = {
  applied: 'Applied',
  completed_flow: 'Completed',
  passed: 'Passed',
  failed: 'Failed',
  rejected: 'Rejected',
  training_in_progress: 'Training',
  training_completed: 'Trained',
  invited_to_schedule: 'Invited',
  scheduled: 'Scheduled',
  hired: 'Hired',
}

const MOVE_TARGETS: Array<{ column: Column; status: string }> = [
  { column: 'new',         status: 'applied'  },
  { column: 'in_progress', status: 'passed'   },
  { column: 'hired',       status: 'hired'    },
  { column: 'rejected',    status: 'rejected' },
]

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [flowFilter, setFlowFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [hoverCol, setHoverCol] = useState<Column | null>(null)

  useEffect(() => {
    fetch('/api/flows').then((r) => r.json()).then(setFlows).catch(() => {})
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

  // Group candidates into the four kanban columns.
  const grouped = useMemo(() => {
    const g: Record<Column, Candidate[]> = { new: [], in_progress: [], hired: [], rejected: [] }
    for (const c of candidates) g[stageToColumn(c.pipelineStatus)].push(c)
    return g
  }, [candidates])

  return (
    <div className="-mx-6 lg:-mx-[132px]">
      <PageHeader
        eyebrow={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
        title="Candidates"
        description="Drag between columns to move candidates through your pipeline."
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {COLUMN_ORDER.map((col) => {
              const meta = COLUMN_META[col]
              const items = grouped[col]
              const isHover = hoverCol === col
              return (
                <div
                  key={col}
                  onDragOver={(e) => { e.preventDefault(); setHoverCol(col) }}
                  onDragLeave={() => setHoverCol((cur) => (cur === col ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/candidate-id')
                    if (!id) return
                    const current = candidates.find((c) => c.id === id)
                    if (!current) return
                    if (stageToColumn(current.pipelineStatus) === col) { setHoverCol(null); return }
                    updateStatus(id, meta.defaultStatus)
                    setHoverCol(null)
                  }}
                  className={`rounded-[14px] border transition-all ${
                    isHover ? 'border-[color:var(--brand-primary)] bg-brand-50/40' : 'border-surface-border bg-white'
                  }`}
                >
                  <div className="px-4 py-3 border-b border-surface-divider flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: meta.accentColor }} />
                      <div className="font-semibold text-[13px] text-ink">{meta.label}</div>
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
                      const stageLabel = STAGE_LABELS[c.pipelineStatus || 'applied'] || 'New'
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
                          className={`rounded-[10px] border border-surface-border bg-white p-3 cursor-grab active:cursor-grabbing transition-shadow ${
                            isDragging ? 'opacity-50' : 'hover:shadow-[0_2px_6px_rgba(26,24,21,0.06)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <Link href={`/dashboard/candidates/${c.id}`} className="font-medium text-[13px] text-ink hover:text-[color:var(--brand-primary)] leading-tight">
                              {c.candidateName || 'Anonymous'}
                            </Link>
                            <Badge tone={COLUMN_META[stageToColumn(c.pipelineStatus)].tone}>{stageLabel}</Badge>
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
                          {/* Quick move buttons — visible on hover, same target set as drag */}
                          <div className="mt-2 pt-2 border-t border-surface-divider flex gap-1.5 opacity-0 hover:opacity-100 transition-opacity" style={{ opacity: isDragging ? 0 : undefined }}>
                            {MOVE_TARGETS.filter((t) => t.column !== col).map((t) => (
                              <button
                                key={t.status}
                                onClick={() => updateStatus(c.id, t.status)}
                                className="flex-1 font-mono text-[9px] uppercase px-2 py-1 rounded-[6px] border border-surface-border text-grey-35 hover:text-ink hover:bg-surface-light transition-colors"
                                style={{ letterSpacing: '0.08em' }}
                                title={`Move to ${COLUMN_META[t.column].label}`}
                              >
                                → {COLUMN_META[t.column].label}
                              </button>
                            ))}
                            <button
                              onClick={() => deleteCandidate(c)}
                              className="font-mono text-[9px] uppercase px-2 py-1 rounded-[6px] border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
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
    </div>
  )
}
