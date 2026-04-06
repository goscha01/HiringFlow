'use client'

import { useParams, useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

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

interface AgentCriteria { id: string; name: string; prompt: string }

export default function CandidateCallPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const agentId = params.slug as string
  const candidateName = searchParams.get('name') || ''
  const widgetContainerRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'call' | 'history'>('call')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedConv, setSelectedConv] = useState<ConversationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [agentName, setAgentName] = useState('')
  const [criteria, setCriteria] = useState<AgentCriteria[]>([])

  // Fetch agent criteria on mount
  useEffect(() => {
    fetch(`/api/public/ai-calls/${agentId}/agent`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setAgentName(d.name || ''); setCriteria(d.criteria || []) }
    }).catch(() => {})
  }, [agentId])

  useEffect(() => {
    const createWidget = () => {
      if (!widgetContainerRef.current) return
      const existing = widgetContainerRef.current.querySelector('elevenlabs-convai')
      if (existing) existing.remove()

      const widget = document.createElement('elevenlabs-convai')
      widget.setAttribute('agent-id', agentId)
      widget.setAttribute('avatar-orb-color-1', '#FF9500')
      widget.setAttribute('avatar-orb-color-2', '#EA8500')
      widget.setAttribute('action-text', 'Start Call')
      widget.setAttribute('start-call-text', 'Start Call')
      widget.setAttribute('end-call-text', 'End Call')
      widget.setAttribute('listening-text', 'Listening...')
      widget.setAttribute('speaking-text', 'Speaking...')
      if (candidateName) {
        widget.setAttribute('dynamic-variables', JSON.stringify({ candidate_name: candidateName }))
      }
      widgetContainerRef.current.appendChild(widget)
    }

    const interval = setInterval(() => {
      if (customElements.get('elevenlabs-convai')) {
        clearInterval(interval)
        createWidget()
      }
    }, 100)
    return () => clearInterval(interval)
  }, [agentId, candidateName])

  const fetchHistory = async () => {
    setLoadingHistory(true)
    const r = await fetch(`/api/public/ai-calls/${agentId}`)
    if (r.ok) {
      const data = await r.json()
      setConversations(data.conversations || [])
    }
    setLoadingHistory(false)
  }

  const viewDetail = async (convId: string) => {
    setLoadingDetail(true)
    const r = await fetch(`/api/public/ai-calls/${agentId}?id=${convId}`)
    if (r.ok) setSelectedConv(await r.json())
    setLoadingDetail(false)
  }

  const formatDate = (unix: number) => new Date(unix * 1000).toLocaleString()
  const formatDuration = (s: number) => s ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` : '—'

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
      <Script src="https://elevenlabs.io/convai-widget/index.js" strategy="afterInteractive" />

      {/* Header */}
      <div className="bg-white border-b border-[#F1F1F3] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#FF9500] rounded-[6px] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#262626]">{candidateName ? `${candidateName} — ${agentName || 'AI Call'}` : agentName || 'AI Voice Call'}</h1>
            <p className="text-[11px] text-[#8A8A8C]">Powered by HireFunnel</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#F7F7F8] rounded-[8px] p-1">
          <button onClick={() => setTab('call')} className={`px-4 py-1.5 text-xs rounded-[6px] font-medium transition-colors ${tab === 'call' ? 'bg-white text-[#262626] shadow-sm' : 'text-[#8A8A8C]'}`}>
            Call
          </button>
          <button onClick={() => { setTab('history'); if (conversations.length === 0) fetchHistory() }} className={`px-4 py-1.5 text-xs rounded-[6px] font-medium transition-colors ${tab === 'history' ? 'bg-white text-[#262626] shadow-sm' : 'text-[#8A8A8C]'}`}>
            My Results
          </button>
        </div>
      </div>

      {/* Call tab */}
      {tab === 'call' && (
        <div className="flex-1 flex flex-col">
          {/* Task summary — evaluation criteria */}
          {criteria.length > 0 && (
            <div className="bg-[#FFF7ED] border-b border-[#FFEDD5] px-6 py-4">
              <div className="max-w-2xl mx-auto">
                <h3 className="text-sm font-semibold text-[#262626] mb-2">
                  {agentName ? `${agentName} — ` : ''}What you&apos;ll be evaluated on:
                </h3>
                <div className="space-y-1.5">
                  {criteria.map((c, i) => (
                    <div key={c.id || i} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#FF9500] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      <div>
                        <span className="text-sm font-medium text-[#262626]">{c.name}</span>
                        {c.prompt && <p className="text-xs text-[#8A8A8C] mt-0.5">{c.prompt}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* Widget */}
          <div className="flex-1 relative flex items-center justify-center" ref={widgetContainerRef} />
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#262626]">Your Conversations</h2>
              <button onClick={fetchHistory} className="text-xs text-[#FF9500] hover:text-[#EA8500] font-medium">Refresh</button>
            </div>

            {loadingHistory ? (
              <div className="text-center py-12 text-[#8A8A8C]">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#8A8A8C]">No conversations yet. Go to the Call tab to start one.</p>
              </div>
            ) : (
              <div className="flex gap-6">
                {/* Table */}
                <div className="flex-1 bg-white rounded-[12px] border border-[#F1F1F3] overflow-hidden">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-[#F1F1F3] bg-[#F7F7F8]">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-[#8A8A8C] uppercase">Date</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-[#8A8A8C] uppercase">Duration</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-[#8A8A8C] uppercase">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F1F3]">
                      {conversations.map(c => (
                        <tr key={c.conversation_id} onClick={() => viewDetail(c.conversation_id)} className={`cursor-pointer hover:bg-[#FAFAFA] transition-colors ${selectedConv?.conversation_id === c.conversation_id ? 'bg-[#FFF7ED]' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="text-sm text-[#262626]">{formatDate(c.start_time_unix_secs)}</div>
                            {c.transcript_summary && <p className="text-xs text-[#8A8A8C] mt-0.5 line-clamp-1">{c.transcript_summary}</p>}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#262626] text-right">{formatDuration(c.call_duration_secs)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              c.call_successful === 'success' ? 'bg-green-100 text-green-700' :
                              c.call_successful === 'failure' ? 'bg-red-100 text-red-600' :
                              'bg-gray-100 text-[#8A8A8C]'
                            }`}>{c.call_successful === 'success' ? 'Passed' : c.call_successful === 'failure' ? 'Failed' : 'Pending'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Detail */}
                {selectedConv && (
                  <div className="w-[360px] flex-shrink-0 space-y-4">
                    {loadingDetail ? (
                      <div className="text-center py-12 text-[#8A8A8C]">Loading...</div>
                    ) : (
                      <>
                        {/* Evaluation */}
                        {selectedConv.analysis && (
                          <div className="bg-white rounded-[12px] border border-[#F1F1F3] p-5">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-sm font-semibold text-[#262626]">Evaluation</h3>
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                                selectedConv.analysis.call_successful === 'success' ? 'bg-green-100 text-green-700' :
                                selectedConv.analysis.call_successful === 'failure' ? 'bg-red-100 text-red-600' :
                                'bg-gray-100 text-[#8A8A8C]'
                              }`}>{selectedConv.analysis.call_successful === 'success' ? 'Passed' : selectedConv.analysis.call_successful === 'failure' ? 'Failed' : 'Pending'}</span>
                            </div>
                            <p className="text-xs text-[#8A8A8C] mb-3">{formatDuration(selectedConv.call_duration_secs)}</p>
                            {selectedConv.analysis.transcript_summary && (
                              <p className="text-sm text-[#59595A] mb-3">{selectedConv.analysis.transcript_summary}</p>
                            )}
                            {selectedConv.analysis.evaluation_criteria_results && Object.keys(selectedConv.analysis.evaluation_criteria_results).length > 0 && (
                              <div className="space-y-2 mb-3">
                                {Object.entries(selectedConv.analysis.evaluation_criteria_results).map(([key, val]) => (
                                  <div key={key} className="bg-[#F7F7F8] rounded-[6px] p-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full ${val.result === 'success' ? 'bg-green-500' : val.result === 'failure' ? 'bg-red-500' : 'bg-gray-400'}`} />
                                      <span className="text-xs font-medium text-[#262626]">{val.criteria_id || key}</span>
                                    </div>
                                    {val.rationale && <p className="text-[11px] text-[#8A8A8C] mt-1 ml-4">{val.rationale}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                            {selectedConv.analysis.data_collection_results && Object.keys(selectedConv.analysis.data_collection_results).length > 0 && (
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(selectedConv.analysis.data_collection_results).map(([key, val]) => (
                                  <div key={key} className="bg-[#F7F7F8] rounded-[6px] p-2.5">
                                    <div className="text-[10px] text-[#8A8A8C]">{key}</div>
                                    <div className="text-xs text-[#262626] font-medium">{val.value || '—'}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Transcript */}
                        {selectedConv.transcript && selectedConv.transcript.length > 0 && (
                          <div className="bg-white rounded-[12px] border border-[#F1F1F3] p-5">
                            <h3 className="text-xs font-semibold text-[#262626] mb-3">Transcript</h3>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                              {selectedConv.transcript.map((turn, i) => (
                                <div key={i} className={`flex gap-2 ${turn.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold ${turn.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-[#FFF7ED] text-[#FF9500]'}`}>{turn.role === 'user' ? 'You' : 'AI'}</div>
                                  <p className={`text-xs px-2.5 py-1.5 rounded-[6px] max-w-[85%] ${turn.role === 'user' ? 'bg-blue-50 text-[#262626]' : 'bg-[#F7F7F8] text-[#262626]'}`}>{turn.message}</p>
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
          </div>
        </div>
      )}

      <style jsx global>{`
        elevenlabs-convai {
          position: relative !important;
          width: 500px !important;
          height: 600px !important;
          max-width: 95vw !important;
          max-height: 85vh !important;
          bottom: auto !important;
          right: auto !important;
          left: auto !important;
          top: auto !important;
          z-index: 1 !important;
        }
        @media (max-width: 640px) {
          elevenlabs-convai {
            width: 100vw !important;
            height: calc(100vh - 52px) !important;
            max-width: 100vw !important;
            max-height: calc(100vh - 52px) !important;
          }
        }
      `}</style>
    </div>
  )
}
