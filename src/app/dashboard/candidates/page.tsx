/**
 * Candidates — refreshed visual skin on the existing filtered-table flow.
 * Design's 4-column kanban isn't applied yet because the existing pipeline
 * has 9 stages; a kanban pass would require collapsing those. Tracked for a
 * later, dedicated UX pass.
 */

'use client'

import { useState, useEffect } from 'react'
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

const STATUSES: Array<{ value: string; label: string; tone: BadgeTone }> = [
  { value: 'all', label: 'All', tone: 'neutral' },
  { value: 'applied', label: 'Applied', tone: 'neutral' },
  { value: 'completed_flow', label: 'Completed', tone: 'info' },
  { value: 'passed', label: 'Passed', tone: 'success' },
  { value: 'failed', label: 'Failed', tone: 'danger' },
  { value: 'training_in_progress', label: 'Training', tone: 'info' },
  { value: 'training_completed', label: 'Trained', tone: 'brand' },
  { value: 'invited_to_schedule', label: 'Invited', tone: 'brand' },
  { value: 'scheduled', label: 'Scheduled', tone: 'warn' },
]

function statusBadge(status: string | null) {
  if (!status) return <Badge tone="neutral">New</Badge>
  const s = STATUSES.find((st) => st.value === status)
  return <Badge tone={s?.tone ?? 'neutral'}>{s?.label || status.replace(/_/g, ' ')}</Badge>
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [flowFilter, setFlowFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    fetch('/api/flows').then((r) => r.json()).then((f) => setFlows(f)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (flowFilter) params.set('flowId', flowFilter)
    if (search) params.set('search', search)
    fetch(`/api/candidates?${params}`).then((r) => r.json()).then((d) => { setCandidates(d); setLoading(false) })
  }, [statusFilter, flowFilter, search])

  const updateStatus = async (id: string, pipelineStatus: string) => {
    await fetch(`/api/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineStatus }),
    })
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, pipelineStatus } : c))
  }

  const counts = candidates.reduce((acc, c) => {
    const s = c.pipelineStatus || 'applied'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="-mx-6 lg:-mx-[132px]">
      <PageHeader
        eyebrow={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
        title="Candidates"
        description="People who have started or completed one of your flows."
      />

      <div className="px-8 py-6">
        {/* Status pills */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {STATUSES.filter((s) => s.value === 'all' || counts[s.value]).map((s) => {
            const active = statusFilter === s.value
            const count = s.value === 'all' ? candidates.length : (counts[s.value] || 0)
            return (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[12px] font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-ink text-white border-ink'
                    : 'bg-white border-surface-border text-grey-35 hover:text-ink'
                }`}
              >
                {s.label}
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/15 text-white' : 'bg-surface-light text-grey-50'}`}
                  style={{ letterSpacing: '0.06em' }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div className="flex gap-2.5 mb-4">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)}
            onBlur={() => setSearch(searchInput)}
            placeholder="Search by name, email, phone…"
            className="flex-1 max-w-xs px-3 py-2 border border-surface-border rounded-[10px] text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/40"
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
          <Card padding={0} className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ background: 'var(--surface-light, #FCFAF6)' }}>
                  {['Candidate', 'Flow', 'Source', 'Status', 'Responses', 'Applied', 'Actions'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 font-mono text-[10px] uppercase text-grey-35 border-b border-surface-divider ${i >= 6 ? 'text-right' : 'text-left'}`}
                      style={{ letterSpacing: '0.1em' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id} className="border-b border-surface-divider last:border-0 hover:bg-surface-light">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/candidates/${c.id}`} className="block">
                        <div className="font-medium text-ink hover:text-[color:var(--brand-primary)]">{c.candidateName || 'Anonymous'}</div>
                        {c.candidateEmail && <div className="text-[11px] text-grey-35">{c.candidateEmail}</div>}
                        {c.candidatePhone && <div className="text-[11px] text-grey-50 font-mono">{c.candidatePhone}</div>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-grey-35">{c.flow?.name || '—'}</td>
                    <td className="px-4 py-3">
                      {c.source || c.ad?.source ? (
                        <Badge tone="brand">{c.ad?.source || c.source}</Badge>
                      ) : (
                        <span className="text-[11px] text-grey-50">Direct</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(c.pipelineStatus)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {c.answerCount > 0 && <span className="font-mono text-[11px] text-grey-35">{c.answerCount}Q</span>}
                        {c.submissionCount > 0 && <span className="font-mono text-[11px] text-[color:var(--brand-fg)]">{c.submissionCount}🎥</span>}
                        {c.answerCount === 0 && c.submissionCount === 0 && <span className="text-[11px] text-grey-50">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-grey-35">{new Date(c.startedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <select
                        value={c.pipelineStatus || ''}
                        onChange={(e) => updateStatus(c.id, e.target.value)}
                        className="text-[11px] px-2 py-1 border border-surface-border rounded-[8px] text-grey-35 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                      >
                        <option value="">New</option>
                        <option value="applied">Applied</option>
                        <option value="completed_flow">Completed</option>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                        <option value="training_in_progress">Training</option>
                        <option value="training_completed">Trained</option>
                        <option value="invited_to_schedule">Invited</option>
                        <option value="scheduled">Scheduled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}
