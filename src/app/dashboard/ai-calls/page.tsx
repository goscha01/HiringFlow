'use client'

import { useState, useEffect } from 'react'

interface Conversation {
  conversation_id: string; agent_id: string; status: string
  start_time_unix_secs: number; call_duration_secs: number
  message_count: number; call_successful: string | null
  transcript_summary: string | null
}

interface ConversationDetail {
  conversation_id: string; status: string; call_duration_secs: number
  transcript: Array<{ role: string; message: string; time_in_call_secs: number }>
  analysis: {
    call_successful: string | null
    transcript_summary: string | null
    evaluation_criteria_results: Record<string, { criteria_id: string; result: string; rationale: string }>
    data_collection_results: Record<string, { value: string; rationale: string }>
  } | null
}

interface Agent { agent_id: string; name: string }

const RESULT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Passed' },
  { value: 'failure', label: 'Failed' },
  { value: 'unknown', label: 'Pending' },
]

export default function AICallsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [candidateName, setCandidateName] = useState('')
  const [candidateCopied, setCandidateCopied] = useState(false)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingCalls, setLoadingCalls] = useState(false)
  const [callError, setCallError] = useState('')
  const [selectedConv, setSelectedConv] = useState<ConversationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [resultFilter, setResultFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/workspace/settings').then(r => r.json()),
      fetch('/api/ai-calls/agents').then(r => r.ok ? r.json() : []),
    ]).then(([ws, agentList]) => {
      setAgents(agentList)
      const s = (ws.settings || {}) as Record<string, string>
      if (s.elevenlabs_agent_id) {
        setAgentId(s.elevenlabs_agent_id)
        fetchConversations()
      }
      setLoading(false)
    })
  }, [])

  const selectAgent = async (id: string) => {
    setAgentId(id)
    setSelectedConv(null)
    await fetch('/api/workspace/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { elevenlabs_agent_id: id } }),
    })
    if (id) fetchConversations()
  }

  const fetchConversations = async () => {
    setLoadingCalls(true); setCallError('')
    const r = await fetch('/api/ai-calls/conversations')
    if (r.ok) { setConversations((await r.json()).conversations || []) }
    else { const err = await r.json().catch(() => ({})); setCallError(err.error || 'Failed to load') }
    setLoadingCalls(false)
  }

  const viewDetail = async (convId: string) => {
    setLoadingDetail(true)
    const r = await fetch(`/api/ai-calls/conversations/${convId}`)
    if (r.ok) setSelectedConv(await r.json())
    setLoadingDetail(false)
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const callLink = agentId ? `${baseUrl}/call/${agentId}` : ''
  const candidateLink = agentId && candidateName.trim()
    ? `${baseUrl}/call/${agentId}?name=${encodeURIComponent(candidateName.trim())}`
    : ''

  const copyLink = (link: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(link); setter(true); setTimeout(() => setter(false), 2000)
  }

  const formatDate = (unix: number) => new Date(unix * 1000).toLocaleString()
  const formatDuration = (s: number) => s ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` : '—'

  // Filtering
  const filtered = conversations.filter(c => {
    if (resultFilter !== 'all') {
      const result = c.call_successful || 'unknown'
      if (result !== resultFilter) return false
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const summary = (c.transcript_summary || '').toLowerCase()
      const id = c.conversation_id.toLowerCase()
      if (!summary.includes(q) && !id.includes(q)) return false
    }
    return true
  })

  // Stats
  const totalCalls = conversations.length
  const passed = conversations.filter(c => c.call_successful === 'success').length
  const failed = conversations.filter(c => c.call_successful === 'failure').length
  const avgDuration = totalCalls > 0 ? Math.round(conversations.reduce((s, c) => s + (c.call_duration_secs || 0), 0) / totalCalls) : 0

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">AI Calls</h1>
          <p className="text-grey-35 mt-1">Voice agent conversations and candidate evaluations</p>
        </div>
        {agentId && (
          <button onClick={() => copyLink(callLink, setCopied)} className={`px-5 py-2.5 text-sm font-medium rounded-[8px] ${copied ? 'bg-green-100 text-green-700' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
            {copied ? 'Copied!' : 'Copy General Link'}
          </button>
        )}
      </div>

      {/* Agent + candidate link */}
      <div className="bg-white rounded-[12px] border border-surface-border p-5 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-grey-20 mb-1">Agent</label>
            <select value={agentId} onChange={e => selectAgent(e.target.value)} className="w-full px-4 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Select an agent...</option>
              {agents.map(a => <option key={a.agent_id} value={a.agent_id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        {agentId && (
          <div className="pt-4 border-t border-surface-border">
            <label className="block text-xs font-medium text-grey-20 mb-1">Create call link for candidate</label>
            <div className="flex gap-2">
              <input type="text" value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="Candidate name" className="flex-1 px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <button onClick={() => candidateLink && copyLink(candidateLink, setCandidateCopied)} disabled={!candidateName.trim()} className={`px-5 py-2.5 text-xs font-medium rounded-[8px] disabled:opacity-50 ${candidateCopied ? 'bg-green-100 text-green-700' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                {candidateCopied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>
        )}
      </div>

      {agentId && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-[8px] border border-surface-border p-4">
              <div className="text-[28px] font-bold text-grey-15">{totalCalls}</div>
              <div className="text-xs text-grey-40">Total Calls</div>
            </div>
            <div className="bg-white rounded-[8px] border border-surface-border p-4">
              <div className="text-[28px] font-bold text-green-600">{passed}</div>
              <div className="text-xs text-grey-40">Passed</div>
            </div>
            <div className="bg-white rounded-[8px] border border-surface-border p-4">
              <div className="text-[28px] font-bold text-red-500">{failed}</div>
              <div className="text-xs text-grey-40">Failed</div>
            </div>
            <div className="bg-white rounded-[8px] border border-surface-border p-4">
              <div className="text-[28px] font-bold text-grey-15">{formatDuration(avgDuration)}</div>
              <div className="text-xs text-grey-40">Avg Duration</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex gap-1 bg-surface rounded-[8px] p-1 border border-surface-border">
              {RESULT_FILTERS.map(f => (
                <button key={f.value} onClick={() => setResultFilter(f.value)} className={`px-4 py-1.5 text-xs rounded-[6px] font-medium transition-colors ${resultFilter === f.value ? 'bg-white text-grey-15 shadow-sm' : 'text-grey-40 hover:text-grey-20'}`}>
                  {f.label}
                  {f.value !== 'all' && (
                    <span className="ml-1.5 text-[10px]">
                      {f.value === 'success' ? passed : f.value === 'failure' ? failed : totalCalls - passed - failed}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search conversations..." className="flex-1 max-w-xs px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button onClick={fetchConversations} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Refresh</button>
          </div>

          {/* Conversations table + detail */}
          {callError ? (
            <div className="bg-red-50 border border-red-200 rounded-[8px] p-4"><p className="text-sm text-red-700">{callError}</p></div>
          ) : loadingCalls ? (
            <div className="text-center py-12 text-grey-40">Loading conversations...</div>
          ) : filtered.length === 0 ? (
            <div className="section-card text-center py-16">
              <h2 className="text-xl font-semibold text-grey-15 mb-2">{conversations.length === 0 ? 'No conversations yet' : 'No matching conversations'}</h2>
              <p className="text-grey-35">{conversations.length === 0 ? 'Share the candidate link to get started.' : 'Try adjusting your filters.'}</p>
            </div>
          ) : (
            <div className="flex gap-6">
              {/* Table */}
              <div className="flex-1 bg-white rounded-[12px] border border-surface-border overflow-hidden">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface">
                      <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Conversation</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Date</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Duration</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Messages</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {filtered.map(c => (
                      <tr key={c.conversation_id} onClick={() => viewDetail(c.conversation_id)} className={`cursor-pointer hover:bg-surface-light transition-colors ${selectedConv?.conversation_id === c.conversation_id ? 'bg-brand-50' : ''}`}>
                        <td className="px-5 py-4">
                          <div className="text-sm font-medium text-grey-15">{c.conversation_id.slice(0, 16)}...</div>
                          {c.transcript_summary && <p className="text-xs text-grey-50 mt-0.5 line-clamp-1 max-w-xs">{c.transcript_summary}</p>}
                        </td>
                        <td className="px-5 py-4 text-xs text-grey-40">{formatDate(c.start_time_unix_secs)}</td>
                        <td className="px-5 py-4 text-sm text-grey-15 text-right font-medium">{formatDuration(c.call_duration_secs)}</td>
                        <td className="px-5 py-4 text-sm text-grey-35 text-right">{c.message_count}</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            c.call_successful === 'success' ? 'bg-green-100 text-green-700' :
                            c.call_successful === 'failure' ? 'bg-red-100 text-red-600' :
                            'bg-gray-100 text-grey-40'
                          }`}>{c.call_successful === 'success' ? 'Passed' : c.call_successful === 'failure' ? 'Failed' : c.status === 'done' ? 'Pending' : c.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Detail panel */}
              {selectedConv && (
                <div className="w-[420px] flex-shrink-0 space-y-4">
                  {loadingDetail ? (
                    <div className="text-center py-12 text-grey-40">Loading...</div>
                  ) : (
                    <>
                      {selectedConv.analysis && (
                        <div className="bg-white rounded-[12px] border border-surface-border p-5">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-grey-15">Evaluation</h3>
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                              selectedConv.analysis.call_successful === 'success' ? 'bg-green-100 text-green-700' :
                              selectedConv.analysis.call_successful === 'failure' ? 'bg-red-100 text-red-600' :
                              'bg-gray-100 text-grey-40'
                            }`}>{selectedConv.analysis.call_successful === 'success' ? 'Passed' : selectedConv.analysis.call_successful === 'failure' ? 'Failed' : 'Unknown'}</span>
                          </div>
                          <p className="text-xs text-grey-40 mb-3">{formatDuration(selectedConv.call_duration_secs)}</p>
                          {selectedConv.analysis.transcript_summary && (
                            <p className="text-sm text-grey-35 mb-3">{selectedConv.analysis.transcript_summary}</p>
                          )}
                          {selectedConv.analysis.evaluation_criteria_results && Object.keys(selectedConv.analysis.evaluation_criteria_results).length > 0 && (
                            <div className="space-y-2 mb-3">
                              {Object.entries(selectedConv.analysis.evaluation_criteria_results).map(([key, val]) => (
                                <div key={key} className="bg-surface rounded-[6px] p-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${val.result === 'success' ? 'bg-green-500' : val.result === 'failure' ? 'bg-red-500' : 'bg-gray-400'}`} />
                                    <span className="text-xs font-medium text-grey-15">{val.criteria_id || key}</span>
                                  </div>
                                  {val.rationale && <p className="text-[11px] text-grey-40 mt-1 ml-4">{val.rationale}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                          {selectedConv.analysis.data_collection_results && Object.keys(selectedConv.analysis.data_collection_results).length > 0 && (
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(selectedConv.analysis.data_collection_results).map(([key, val]) => (
                                <div key={key} className="bg-surface rounded-[6px] p-2.5">
                                  <div className="text-[10px] text-grey-40">{key}</div>
                                  <div className="text-xs text-grey-15 font-medium">{val.value || '—'}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {selectedConv.transcript && selectedConv.transcript.length > 0 && (
                        <div className="bg-white rounded-[12px] border border-surface-border p-5">
                          <h3 className="text-xs font-semibold text-grey-15 mb-3">Transcript</h3>
                          <div className="space-y-2 max-h-[350px] overflow-y-auto">
                            {selectedConv.transcript.map((turn, i) => (
                              <div key={i} className={`flex gap-2 ${turn.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold ${turn.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-brand-100 text-brand-600'}`}>{turn.role === 'user' ? 'U' : 'AI'}</div>
                                <p className={`text-xs px-2.5 py-1.5 rounded-[6px] inline-block max-w-[80%] ${turn.role === 'user' ? 'bg-blue-50 text-grey-15' : 'bg-surface text-grey-15'}`}>{turn.message}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
