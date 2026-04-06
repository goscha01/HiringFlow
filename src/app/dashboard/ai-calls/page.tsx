'use client'

import { useState, useEffect } from 'react'

interface Agent { agent_id: string; name: string }
interface Candidate { id: string; name: string; agentId: string; conversationIds: string[]; createdAt: string }
interface Conversation {
  conversation_id: string; status: string; start_time_unix_secs: number
  call_duration_secs: number; message_count: number; call_successful: string | null
  transcript_summary: string | null
}
interface ConversationDetail {
  conversation_id: string; status: string; call_duration_secs: number
  transcript: Array<{ role: string; message: string; time_in_call_secs: number }>
  analysis: {
    call_successful: string | null; transcript_summary: string | null
    evaluation_criteria_results: Record<string, { criteria_id: string; result: string; rationale: string }>
    data_collection_results: Record<string, { value: string; rationale: string }>
  } | null
}

export default function AICallsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [candidateName, setCandidateName] = useState('')
  const [candidateCopied, setCandidateCopied] = useState(false)

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingCalls, setLoadingCalls] = useState(false)
  const [callError, setCallError] = useState('')
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [selectedConv, setSelectedConv] = useState<ConversationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [candidateConvs, setCandidateConvs] = useState<ConversationDetail[]>([])
  const [loadingCandidateConvs, setLoadingCandidateConvs] = useState(false)

  // Assign modal
  const [showAssign, setShowAssign] = useState(false)
  const [assignConvId, setAssignConvId] = useState('')
  const [assignCandidateId, setAssignCandidateId] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/workspace/settings').then(r => r.json()),
      fetch('/api/ai-calls/agents').then(r => r.ok ? r.json() : []),
      fetch('/api/ai-calls/candidates').then(r => r.ok ? r.json() : []),
    ]).then(([ws, agentList, candList]) => {
      setAgents(agentList)
      setCandidates(candList)
      const s = (ws.settings || {}) as Record<string, string>
      if (s.elevenlabs_agent_id) { setAgentId(s.elevenlabs_agent_id); fetchConversations() }
      setLoading(false)
    })
  }, [])

  const selectAgent = async (id: string) => {
    setAgentId(id); setSelectedCandidate(null); setSelectedConv(null)
    await fetch('/api/workspace/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: { elevenlabs_agent_id: id } }) })
    if (id) fetchConversations()
  }

  const fetchConversations = async () => {
    setLoadingCalls(true); setCallError('')
    const r = await fetch('/api/ai-calls/conversations')
    if (r.ok) setConversations((await r.json()).conversations || [])
    else { const err = await r.json().catch(() => ({})); setCallError(err.error || 'Failed') }
    setLoadingCalls(false)
  }

  const createCandidateLink = async () => {
    if (!candidateName.trim() || !agentId) return
    // Save candidate
    const r = await fetch('/api/ai-calls/candidates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: candidateName.trim(), agentId }),
    })
    if (r.ok) {
      const c = await r.json()
      setCandidates(prev => [c, ...prev])
    }
    // Copy link
    const link = `${window.location.origin}/call/${agentId}?name=${encodeURIComponent(candidateName.trim())}`
    navigator.clipboard.writeText(link)
    setCandidateCopied(true); setTimeout(() => setCandidateCopied(false), 2000)
    setCandidateName('')
  }

  const viewCandidateConvs = async (cand: Candidate) => {
    setSelectedCandidate(cand); setSelectedConv(null); setCandidateConvs([])
    if (cand.conversationIds.length === 0) return
    setLoadingCandidateConvs(true)
    const details = await Promise.all(
      cand.conversationIds.map(async cid => {
        const r = await fetch(`/api/ai-calls/conversations/${cid}`)
        return r.ok ? r.json() : null
      })
    )
    setCandidateConvs(details.filter(Boolean))
    setLoadingCandidateConvs(false)
  }

  const assignConversation = async () => {
    if (!assignConvId || !assignCandidateId) return
    await fetch(`/api/ai-calls/candidates/${assignCandidateId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: assignConvId }),
    })
    // Refresh
    const r = await fetch('/api/ai-calls/candidates')
    if (r.ok) setCandidates(await r.json())
    setShowAssign(false); setAssignConvId(''); setAssignCandidateId('')
    if (selectedCandidate) {
      const updated = candidates.find(c => c.id === selectedCandidate.id)
      if (updated) viewCandidateConvs(updated)
    }
  }

  const deleteCandidate = async (id: string) => {
    if (!confirm('Remove this candidate?')) return
    await fetch(`/api/ai-calls/candidates/${id}`, { method: 'DELETE' })
    setCandidates(prev => prev.filter(c => c.id !== id))
    if (selectedCandidate?.id === id) { setSelectedCandidate(null); setCandidateConvs([]) }
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const formatDate = (unix: number) => new Date(unix * 1000).toLocaleString()
  const formatDateStr = (s: string) => new Date(s).toLocaleDateString()
  const formatDuration = (s: number) => s ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` : '—'

  // Stats
  const passed = conversations.filter(c => c.call_successful === 'success').length
  const failed = conversations.filter(c => c.call_successful === 'failure').length

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">AI Calls</h1>
          <p className="text-grey-35 mt-1">Voice agent conversations and candidate evaluations</p>
        </div>
      </div>

      {/* Agent + create link */}
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
              <input type="text" value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="Candidate name" className="flex-1 px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" onKeyDown={e => e.key === 'Enter' && createCandidateLink()} />
              <button onClick={createCandidateLink} disabled={!candidateName.trim()} className={`px-5 py-2.5 text-xs font-medium rounded-[8px] disabled:opacity-50 ${candidateCopied ? 'bg-green-100 text-green-700' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                {candidateCopied ? 'Saved & Copied!' : 'Save & Copy Link'}
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
              <div className="text-[28px] font-bold text-grey-15">{candidates.length}</div>
              <div className="text-xs text-grey-40">Candidates</div>
            </div>
            <div className="bg-white rounded-[8px] border border-surface-border p-4">
              <div className="text-[28px] font-bold text-grey-15">{conversations.length}</div>
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
          </div>

          <div className="flex gap-6">
            {/* Candidates list */}
            <div className="w-80 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-grey-15">Candidates ({candidates.length})</h3>
                <button onClick={fetchConversations} className="text-xs text-brand-500 hover:text-brand-600">Refresh</button>
              </div>

              {candidates.length === 0 ? (
                <div className="bg-white rounded-[12px] border border-surface-border p-6 text-center text-grey-40 text-sm">
                  Create a candidate link above to get started
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {candidates.map(c => (
                    <button
                      key={c.id}
                      onClick={() => viewCandidateConvs(c)}
                      className={`w-full text-left bg-white rounded-[8px] border p-4 transition-colors ${selectedCandidate?.id === c.id ? 'border-brand-500 bg-brand-50' : 'border-surface-border hover:border-brand-300'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-grey-15">{c.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-grey-40 font-medium">
                            {c.conversationIds.length} call{c.conversationIds.length !== 1 ? 's' : ''}
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); deleteCandidate(c.id) }} className="text-xs text-grey-50 hover:text-red-500 ml-1">&times;</button>
                        </div>
                      </div>
                      <div className="text-xs text-grey-50 mt-1">Created {formatDateStr(c.createdAt)}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Unassigned conversations */}
              {conversations.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-grey-40">Unassigned Conversations</h4>
                    <button onClick={() => setShowAssign(true)} className="text-[10px] text-brand-500 hover:text-brand-600">Assign</button>
                  </div>
                  <div className="space-y-1">
                    {conversations.filter(c => !candidates.some(cand => cand.conversationIds.includes(c.conversation_id))).slice(0, 5).map(c => (
                      <div key={c.conversation_id} className="text-xs bg-surface rounded-[6px] px-3 py-2 flex items-center justify-between">
                        <div>
                          <span className="text-grey-35">{formatDate(c.start_time_unix_secs)}</span>
                          <span className="text-grey-50 ml-2">{formatDuration(c.call_duration_secs)}</span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.call_successful === 'success' ? 'bg-green-100 text-green-700' : c.call_successful === 'failure' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-grey-40'}`}>
                          {c.call_successful === 'success' ? 'Pass' : c.call_successful === 'failure' ? 'Fail' : '?'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Detail panel */}
            <div className="flex-1">
              {selectedCandidate ? (
                <div>
                  <h3 className="text-lg font-semibold text-grey-15 mb-4">{selectedCandidate.name}</h3>

                  {loadingCandidateConvs ? (
                    <div className="text-center py-12 text-grey-40">Loading conversations...</div>
                  ) : candidateConvs.length === 0 ? (
                    <div className="bg-white rounded-[12px] border border-surface-border p-8 text-center">
                      <p className="text-grey-40 mb-3">No conversations linked yet.</p>
                      <p className="text-xs text-grey-50">Assign unassigned conversations from the left panel, or the candidate needs to make a call.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {candidateConvs.map(conv => (
                        <div key={conv.conversation_id} className="bg-white rounded-[12px] border border-surface-border p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                                conv.analysis?.call_successful === 'success' ? 'bg-green-100 text-green-700' :
                                conv.analysis?.call_successful === 'failure' ? 'bg-red-100 text-red-600' :
                                'bg-gray-100 text-grey-40'
                              }`}>{conv.analysis?.call_successful === 'success' ? 'Passed' : conv.analysis?.call_successful === 'failure' ? 'Failed' : 'Pending'}</span>
                              <span className="text-xs text-grey-40">{formatDuration(conv.call_duration_secs)}</span>
                            </div>
                            <span className="text-xs text-grey-50">{conv.conversation_id.slice(0, 12)}...</span>
                          </div>

                          {conv.analysis?.transcript_summary && (
                            <p className="text-sm text-grey-35 mb-3">{conv.analysis.transcript_summary}</p>
                          )}

                          {conv.analysis?.evaluation_criteria_results && Object.keys(conv.analysis.evaluation_criteria_results).length > 0 && (
                            <div className="space-y-1.5 mb-3">
                              {Object.entries(conv.analysis.evaluation_criteria_results).map(([key, val]) => (
                                <div key={key} className="flex items-start gap-2">
                                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${val.result === 'success' ? 'bg-green-500' : val.result === 'failure' ? 'bg-red-500' : 'bg-gray-400'}`} />
                                  <div>
                                    <span className="text-xs font-medium text-grey-15">{val.criteria_id || key}</span>
                                    {val.rationale && <p className="text-[11px] text-grey-40">{val.rationale}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {conv.transcript && conv.transcript.length > 0 && (
                            <details className="mt-2">
                              <summary className="text-xs text-brand-500 hover:text-brand-600 cursor-pointer font-medium">Show transcript ({conv.transcript.length} messages)</summary>
                              <div className="mt-2 space-y-1.5 max-h-[250px] overflow-y-auto">
                                {conv.transcript.map((turn, i) => (
                                  <div key={i} className={`flex gap-2 ${turn.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold ${turn.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-brand-100 text-brand-600'}`}>{turn.role === 'user' ? 'U' : 'AI'}</div>
                                    <p className={`text-xs px-2 py-1.5 rounded-[6px] max-w-[80%] ${turn.role === 'user' ? 'bg-blue-50' : 'bg-surface'} text-grey-15`}>{turn.message}</p>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-[12px] border border-surface-border p-12 text-center text-grey-40">
                  Select a candidate to view their conversations and evaluations
                </div>
              )}
            </div>
          </div>

          {/* Assign modal */}
          {showAssign && (
            <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setShowAssign(false)}>
              <div className="bg-white rounded-[12px] shadow-2xl p-6 w-full max-w-[400px]" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-semibold text-grey-15 mb-4">Assign Conversation</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-grey-20 mb-1">Conversation</label>
                    <select value={assignConvId} onChange={e => setAssignConvId(e.target.value)} className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-sm">
                      <option value="">Select...</option>
                      {conversations.filter(c => !candidates.some(cand => cand.conversationIds.includes(c.conversation_id))).map(c => (
                        <option key={c.conversation_id} value={c.conversation_id}>{formatDate(c.start_time_unix_secs)} — {formatDuration(c.call_duration_secs)} — {c.call_successful || 'pending'}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-grey-20 mb-1">Candidate</label>
                    <select value={assignCandidateId} onChange={e => setAssignCandidateId(e.target.value)} className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-sm">
                      <option value="">Select...</option>
                      {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={() => setShowAssign(false)} className="btn-secondary flex-1">Cancel</button>
                  <button onClick={assignConversation} disabled={!assignConvId || !assignCandidateId} className="btn-primary flex-1 disabled:opacity-50">Assign</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
