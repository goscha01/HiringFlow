'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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

const STATUSES = [
  { value: 'all', label: 'All', color: '' },
  { value: 'applied', label: 'Applied', color: 'bg-gray-100 text-gray-700' },
  { value: 'completed_flow', label: 'Completed', color: 'bg-blue-100 text-blue-700' },
  { value: 'passed', label: 'Passed', color: 'bg-green-100 text-green-700' },
  { value: 'failed', label: 'Failed', color: 'bg-red-100 text-red-700' },
  { value: 'training_in_progress', label: 'Training', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'training_completed', label: 'Trained', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'invited_to_schedule', label: 'Invited', color: 'bg-purple-100 text-purple-700' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-brand-100 text-brand-700' },
]

function statusBadge(status: string | null) {
  if (!status) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">New</span>
  const s = STATUSES.find(st => st.value === status)
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s?.color || 'bg-gray-100 text-gray-600'}`}>{s?.label || status.replace(/_/g, ' ')}</span>
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
    fetch('/api/flows').then(r => r.json()).then(f => setFlows(f)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (flowFilter) params.set('flowId', flowFilter)
    if (search) params.set('search', search)
    fetch(`/api/candidates?${params}`).then(r => r.json()).then(d => { setCandidates(d); setLoading(false) })
  }, [statusFilter, flowFilter, search])

  const updateStatus = async (id: string, pipelineStatus: string) => {
    await fetch(`/api/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineStatus }),
    })
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, pipelineStatus } : c))
  }

  // Counts per status
  const counts = candidates.reduce((acc, c) => {
    const s = c.pipelineStatus || 'new'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">Candidates</h1>
          <p className="text-grey-35 mt-1">{candidates.length} candidate{candidates.length !== 1 ? 's' : ''} in your pipeline</p>
        </div>
      </div>

      {/* Funnel summary */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {STATUSES.filter(s => s.value === 'all' || counts[s.value]).map(s => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === s.value
                ? 'bg-brand-500 text-white'
                : 'bg-white border border-surface-border text-grey-35 hover:border-brand-300'
            }`}
          >
            {s.label}
            {s.value !== 'all' && counts[s.value] && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusFilter === s.value ? 'bg-white/20' : 'bg-surface text-grey-40'}`}>
                {counts[s.value]}
              </span>
            )}
            {s.value === 'all' && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusFilter === 'all' ? 'bg-white/20' : 'bg-surface text-grey-40'}`}>
                {candidates.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 max-w-xs">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)}
            onBlur={() => setSearch(searchInput)}
            placeholder="Search by name, email, phone..."
            className="w-full px-4 py-2.5 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={flowFilter}
          onChange={(e) => setFlowFilter(e.target.value)}
          className="px-4 py-2.5 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All flows</option>
          {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-grey-40">Loading...</div>
      ) : candidates.length === 0 ? (
        <div className="section-card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-grey-15 mb-2">No candidates yet</h2>
          <p className="text-grey-35">Candidates will appear here once they start a flow</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-surface-border overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-surface-border bg-surface">
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Candidate</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Flow</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Source</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Responses</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Applied</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {candidates.map(c => (
                <tr key={c.id} className="hover:bg-surface-light">
                  <td className="px-5 py-4">
                    <Link href={`/dashboard/candidates/${c.id}`} className="block">
                      <div className="text-sm font-medium text-grey-15 hover:text-brand-500">{c.candidateName || 'Anonymous'}</div>
                      {c.candidateEmail && <div className="text-xs text-grey-40">{c.candidateEmail}</div>}
                      {c.candidatePhone && <div className="text-xs text-grey-50">{c.candidatePhone}</div>}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-grey-35">{c.flow?.name || '—'}</td>
                  <td className="px-5 py-4">
                    {c.source || c.ad?.source ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium capitalize">{c.ad?.source || c.source}</span>
                    ) : (
                      <span className="text-xs text-grey-50">Direct</span>
                    )}
                  </td>
                  <td className="px-5 py-4">{statusBadge(c.pipelineStatus)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      {c.answerCount > 0 && <span className="text-xs text-grey-40">{c.answerCount} answers</span>}
                      {c.submissionCount > 0 && <span className="text-xs text-purple-600">{c.submissionCount} videos</span>}
                      {c.answerCount === 0 && c.submissionCount === 0 && <span className="text-xs text-grey-50">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-grey-40">{new Date(c.startedAt).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-right">
                    <select
                      value={c.pipelineStatus || ''}
                      onChange={(e) => updateStatus(c.id, e.target.value)}
                      className="text-xs px-2 py-1 border border-surface-border rounded-[6px] text-grey-35 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
        </div>
      )}
    </div>
  )
}
