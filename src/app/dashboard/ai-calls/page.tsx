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

export default function AICallsPage() {
  const [agentId, setAgentId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'settings' | 'calls'>('calls')

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingCalls, setLoadingCalls] = useState(false)
  const [callError, setCallError] = useState('')
  const [selectedConv, setSelectedConv] = useState<ConversationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    fetch('/api/workspace/settings').then(r => r.json()).then(d => {
      const s = (d.settings || {}) as Record<string, string>
      if (s.elevenlabs_agent_id) setAgentId(s.elevenlabs_agent_id)
      if (s.elevenlabs_api_key) setApiKey(s.elevenlabs_api_key)
      setLoading(false)
      if (s.elevenlabs_agent_id && s.elevenlabs_api_key) fetchConversations()
    })
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    await fetch('/api/workspace/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { elevenlabs_agent_id: agentId, elevenlabs_api_key: apiKey } }),
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
    if (agentId && apiKey) fetchConversations()
  }

  const fetchConversations = async () => {
    setLoadingCalls(true); setCallError('')
    const r = await fetch('/api/ai-calls/conversations')
    if (r.ok) {
      const data = await r.json()
      setConversations(data.conversations || [])
    } else {
      const err = await r.json().catch(() => ({}))
      setCallError(err.error || 'Failed to fetch conversations')
    }
    setLoadingCalls(false)
  }

  const viewDetail = async (convId: string) => {
    setLoadingDetail(true)
    const r = await fetch(`/api/ai-calls/conversations/${convId}`)
    if (r.ok) setSelectedConv(await r.json())
    setLoadingDetail(false)
  }

  const callLink = typeof window !== 'undefined' && agentId ? `${window.location.origin}/call/${agentId}` : ''
  const copyLink = () => { if (callLink) { navigator.clipboard.writeText(callLink); setCopied(true); setTimeout(() => setCopied(false), 2000) } }

  const formatDate = (unix: number) => new Date(unix * 1000).toLocaleString()
  const formatDuration = (s: number) => s ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` : '—'

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">AI Calls</h1>
          <p className="text-grey-35 mt-1">ElevenLabs voice agent — calls, transcripts, and evaluations</p>
        </div>
        {agentId && (
          <button onClick={copyLink} className={`px-5 py-2.5 text-sm font-medium rounded-[8px] ${copied ? 'bg-green-100 text-green-700' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
            {copied ? 'Link Copied!' : 'Copy Candidate Link'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-surface-border">
        <button onClick={() => setTab('calls')} className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'calls' ? 'border-brand-500 text-brand-600' : 'border-transparent text-grey-40 hover:text-grey-20'}`}>
          Conversations ({conversations.length})
        </button>
        <button onClick={() => setTab('settings')} className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'settings' ? 'border-brand-500 text-brand-600' : 'border-transparent text-grey-40 hover:text-grey-20'}`}>
          Settings
        </button>
      </div>

      {/* SETTINGS TAB */}
      {tab === 'settings' && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-white rounded-[12px] border border-surface-border p-6">
            <h3 className="text-lg font-semibold text-grey-15 mb-4">ElevenLabs Connection</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Agent ID</label>
                <input type="text" value={agentId} onChange={e => setAgentId(e.target.value)} placeholder="agent_4501k18xybcmfrqatj21c99egrza" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="xi-xxxxxxxxxxxxxxxx" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <p className="text-xs text-grey-50 mt-1">Found in your ElevenLabs account settings. Used to fetch conversation history and evaluations.</p>
              </div>
              <button onClick={saveSettings} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>

          {agentId && (
            <div className="bg-white rounded-[12px] border border-surface-border p-6">
              <h3 className="text-lg font-semibold text-grey-15 mb-3">Candidate Link</h3>
              <p className="text-sm text-grey-35 mb-3">Share this with candidates to start a voice call with your AI agent.</p>
              <div className="flex gap-2">
                <code className="flex-1 bg-surface rounded-[8px] px-4 py-3 text-sm text-grey-15 truncate">{callLink}</code>
                <button onClick={copyLink} className={`px-5 py-3 text-sm font-medium rounded-[8px] ${copied ? 'bg-green-100 text-green-700' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CALLS TAB */}
      {tab === 'calls' && (
        <div>
          {!agentId || !apiKey ? (
            <div className="section-card text-center py-16">
              <p className="text-grey-35 mb-4">Configure your ElevenLabs Agent ID and API Key in Settings first.</p>
              <button onClick={() => setTab('settings')} className="btn-primary">Go to Settings</button>
            </div>
          ) : callError ? (
            <div className="bg-red-50 border border-red-200 rounded-[8px] p-4 mb-4">
              <p className="text-sm text-red-700">{callError}</p>
              <button onClick={fetchConversations} className="text-xs text-red-500 hover:text-red-700 mt-1">Retry</button>
            </div>
          ) : loadingCalls ? (
            <div className="text-center py-12 text-grey-40">Loading conversations from ElevenLabs...</div>
          ) : conversations.length === 0 ? (
            <div className="section-card text-center py-16">
              <h2 className="text-xl font-semibold text-grey-15 mb-2">No conversations yet</h2>
              <p className="text-grey-35 mb-4">Share the candidate link to get started. Conversations will appear here automatically.</p>
              <button onClick={fetchConversations} className="btn-secondary text-sm">Refresh</button>
            </div>
          ) : (
            <div className="flex gap-6">
              {/* Conversations list */}
              <div className="w-96 bg-white rounded-[12px] border border-surface-border overflow-hidden flex-shrink-0">
                <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
                  <span className="text-sm font-semibold text-grey-15">Conversations</span>
                  <button onClick={fetchConversations} className="text-xs text-brand-500 hover:text-brand-600">Refresh</button>
                </div>
                <div className="divide-y divide-surface-border max-h-[600px] overflow-y-auto">
                  {conversations.map(c => (
                    <button
                      key={c.conversation_id}
                      onClick={() => viewDetail(c.conversation_id)}
                      className={`w-full text-left px-4 py-3 hover:bg-surface-light transition-colors ${selectedConv?.conversation_id === c.conversation_id ? 'bg-brand-50' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-grey-15 truncate">{c.conversation_id.slice(0, 12)}...</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          c.call_successful === 'success' ? 'bg-green-100 text-green-700' :
                          c.call_successful === 'failure' ? 'bg-red-100 text-red-600' :
                          c.status === 'done' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-grey-40'
                        }`}>
                          {c.call_successful || c.status}
                        </span>
                      </div>
                      <div className="text-xs text-grey-40">
                        {formatDate(c.start_time_unix_secs)} &middot; {formatDuration(c.call_duration_secs)} &middot; {c.message_count} msgs
                      </div>
                      {c.transcript_summary && <p className="text-xs text-grey-50 mt-1 line-clamp-2">{c.transcript_summary}</p>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detail panel */}
              <div className="flex-1">
                {loadingDetail ? (
                  <div className="text-center py-12 text-grey-40">Loading conversation...</div>
                ) : selectedConv ? (
                  <div className="space-y-4">
                    {/* Evaluation */}
                    {selectedConv.analysis && (
                      <div className="bg-white rounded-[12px] border border-surface-border p-6">
                        <h3 className="text-lg font-semibold text-grey-15 mb-3">Evaluation</h3>
                        <div className="flex items-center gap-3 mb-4">
                          <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                            selectedConv.analysis.call_successful === 'success' ? 'bg-green-100 text-green-700' :
                            selectedConv.analysis.call_successful === 'failure' ? 'bg-red-100 text-red-600' :
                            'bg-gray-100 text-grey-40'
                          }`}>
                            {selectedConv.analysis.call_successful === 'success' ? 'Passed' :
                             selectedConv.analysis.call_successful === 'failure' ? 'Failed' : 'Unknown'}
                          </span>
                          <span className="text-sm text-grey-40">{formatDuration(selectedConv.call_duration_secs)}</span>
                        </div>

                        {selectedConv.analysis.transcript_summary && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-grey-20 mb-1">Summary</h4>
                            <p className="text-sm text-grey-35">{selectedConv.analysis.transcript_summary}</p>
                          </div>
                        )}

                        {/* Criteria results */}
                        {selectedConv.analysis.evaluation_criteria_results && Object.keys(selectedConv.analysis.evaluation_criteria_results).length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-grey-20 mb-2">Criteria</h4>
                            <div className="space-y-2">
                              {Object.entries(selectedConv.analysis.evaluation_criteria_results).map(([key, val]) => (
                                <div key={key} className="bg-surface rounded-[8px] p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`w-2 h-2 rounded-full ${val.result === 'success' ? 'bg-green-500' : val.result === 'failure' ? 'bg-red-500' : 'bg-gray-400'}`} />
                                    <span className="text-sm font-medium text-grey-15">{val.criteria_id || key}</span>
                                    <span className={`text-xs ${val.result === 'success' ? 'text-green-600' : val.result === 'failure' ? 'text-red-600' : 'text-grey-40'}`}>{val.result}</span>
                                  </div>
                                  {val.rationale && <p className="text-xs text-grey-40 ml-4">{val.rationale}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Data collection */}
                        {selectedConv.analysis.data_collection_results && Object.keys(selectedConv.analysis.data_collection_results).length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-grey-20 mb-2">Collected Data</h4>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(selectedConv.analysis.data_collection_results).map(([key, val]) => (
                                <div key={key} className="bg-surface rounded-[8px] p-3">
                                  <div className="text-xs text-grey-40">{key}</div>
                                  <div className="text-sm text-grey-15 font-medium">{val.value || '—'}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Transcript */}
                    {selectedConv.transcript && selectedConv.transcript.length > 0 && (
                      <div className="bg-white rounded-[12px] border border-surface-border p-6">
                        <h3 className="text-sm font-semibold text-grey-15 mb-3">Transcript</h3>
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {selectedConv.transcript.map((turn, i) => (
                            <div key={i} className={`flex gap-3 ${turn.role === 'user' ? 'flex-row-reverse' : ''}`}>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                                turn.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-brand-100 text-brand-600'
                              }`}>{turn.role === 'user' ? 'U' : 'AI'}</div>
                              <div className={`max-w-[75%] ${turn.role === 'user' ? 'text-right' : ''}`}>
                                <p className={`text-sm px-3 py-2 rounded-[8px] inline-block ${
                                  turn.role === 'user' ? 'bg-blue-50 text-grey-15' : 'bg-surface text-grey-15'
                                }`}>{turn.message}</p>
                                <p className="text-[10px] text-grey-50 mt-0.5 px-1">{formatDuration(Math.round(turn.time_in_call_secs))}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-[12px] border border-surface-border p-12 text-center text-grey-40">
                    Select a conversation to view details and evaluation
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
