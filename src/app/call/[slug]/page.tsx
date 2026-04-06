'use client'

import { useParams, useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

interface EvalResult {
  conversation_id: string
  status: string
  call_duration_secs: number
  transcript: Array<{ role: string; message: string; time_in_call_secs: number }>
  analysis: {
    call_successful: string | null
    transcript_summary: string | null
    evaluation_criteria_results: Record<string, { criteria_id: string; result: string; rationale: string }>
    data_collection_results: Record<string, { value: string; rationale: string }>
  } | null
}

export default function CandidateCallPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const agentId = params.slug as string
  const candidateName = searchParams.get('name') || ''
  const widgetContainerRef = useRef<HTMLDivElement>(null)
  const [showResults, setShowResults] = useState(false)
  const [results, setResults] = useState<EvalResult | null>(null)
  const [loadingResults, setLoadingResults] = useState(false)
  const [resultError, setResultError] = useState('')

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

  const fetchResults = async (retries = 3) => {
    setLoadingResults(true)
    setResultError('')

    for (let i = 0; i < retries; i++) {
      try {
        if (i > 0) await new Promise(r => setTimeout(r, 3000))

        const res = await fetch(`/api/public/ai-calls/${agentId}`)
        if (res.ok) {
          const data = await res.json()
          setResults(data)
          setShowResults(true)
          setLoadingResults(false)
          return
        }

        const err = await res.json().catch(() => ({}))
        if (err.processing && i < retries - 1) continue

      } catch { /* retry */ }
    }

    setResultError('Results are still processing. Please wait a moment and try again.')
    setLoadingResults(false)
  }

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
            <h1 className="text-sm font-semibold text-[#262626]">{candidateName ? `${candidateName} — AI Call` : 'AI Voice Call'}</h1>
            <p className="text-[11px] text-[#8A8A8C]">Powered by HireFunnel</p>
          </div>
        </div>
        {!showResults && (
          <button
            onClick={() => fetchResults()}
            disabled={loadingResults}
            className="px-4 py-2 text-xs font-medium rounded-[8px] bg-[#FF9500] text-white hover:bg-[#EA8500] disabled:opacity-50 transition-colors"
          >
            {loadingResults ? 'Loading...' : 'See My Results'}
          </button>
        )}
      </div>

      {/* Results view */}
      {showResults && results ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-lg mx-auto space-y-4">
            {/* Overall result */}
            <div className="bg-white rounded-[16px] border border-[#F1F1F3] p-8 text-center shadow-sm">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
                results.analysis?.call_successful === 'success' ? 'bg-green-50' :
                results.analysis?.call_successful === 'failure' ? 'bg-red-50' : 'bg-gray-50'
              }`}>
                {results.analysis?.call_successful === 'success' ? (
                  <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ) : results.analysis?.call_successful === 'failure' ? (
                  <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ) : (
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                )}
              </div>
              <h2 className="text-2xl font-bold text-[#262626] mb-1">
                {results.analysis?.call_successful === 'success' ? 'Great Job!' :
                 results.analysis?.call_successful === 'failure' ? 'Needs Improvement' : 'Call Complete'}
              </h2>
              <p className="text-sm text-[#59595A]">Call duration: {formatDuration(results.call_duration_secs)}</p>
            </div>

            {/* Summary */}
            {results.analysis?.transcript_summary && (
              <div className="bg-white rounded-[12px] border border-[#F1F1F3] p-6">
                <h3 className="text-sm font-semibold text-[#262626] mb-2">Summary</h3>
                <p className="text-sm text-[#59595A] leading-relaxed">{results.analysis.transcript_summary}</p>
              </div>
            )}

            {/* Criteria */}
            {results.analysis?.evaluation_criteria_results && Object.keys(results.analysis.evaluation_criteria_results).length > 0 && (
              <div className="bg-white rounded-[12px] border border-[#F1F1F3] p-6">
                <h3 className="text-sm font-semibold text-[#262626] mb-3">Evaluation</h3>
                <div className="space-y-3">
                  {Object.entries(results.analysis.evaluation_criteria_results).map(([key, val]) => (
                    <div key={key} className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        val.result === 'success' ? 'bg-green-100' : val.result === 'failure' ? 'bg-red-100' : 'bg-gray-100'
                      }`}>
                        {val.result === 'success' ? (
                          <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        ) : val.result === 'failure' ? (
                          <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-gray-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[#262626]">{val.criteria_id || key}</div>
                        {val.rationale && <p className="text-xs text-[#8A8A8C] mt-0.5">{val.rationale}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Collected data */}
            {results.analysis?.data_collection_results && Object.keys(results.analysis.data_collection_results).length > 0 && (
              <div className="bg-white rounded-[12px] border border-[#F1F1F3] p-6">
                <h3 className="text-sm font-semibold text-[#262626] mb-3">Your Responses</h3>
                <div className="space-y-2">
                  {Object.entries(results.analysis.data_collection_results).map(([key, val]) => (
                    <div key={key} className="bg-[#F7F7F8] rounded-[8px] p-3">
                      <div className="text-xs text-[#8A8A8C]">{key}</div>
                      <div className="text-sm text-[#262626] font-medium">{val.value || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transcript */}
            {results.transcript && results.transcript.length > 0 && (
              <div className="bg-white rounded-[12px] border border-[#F1F1F3] p-6">
                <h3 className="text-sm font-semibold text-[#262626] mb-3">Transcript</h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {results.transcript.map((turn, i) => (
                    <div key={i} className={`flex gap-3 ${turn.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                        turn.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-[#FFF7ED] text-[#FF9500]'
                      }`}>{turn.role === 'user' ? 'You' : 'AI'}</div>
                      <div className={`max-w-[80%] ${turn.role === 'user' ? 'text-right' : ''}`}>
                        <p className={`text-sm px-3 py-2 rounded-[8px] inline-block ${
                          turn.role === 'user' ? 'bg-blue-50 text-[#262626]' : 'bg-[#F7F7F8] text-[#262626]'
                        }`}>{turn.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Done */}
            <div className="text-center pt-4 pb-8">
              <p className="text-sm text-[#8A8A8C]">Thank you{candidateName ? `, ${candidateName}` : ''}! You can close this page.</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Widget area */}
          <div className="flex-1 relative flex items-center justify-center" ref={widgetContainerRef} />

          {resultError && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white border border-[#F1F1F3] rounded-[12px] px-6 py-4 shadow-lg text-center">
              <p className="text-sm text-[#59595A] mb-2">{resultError}</p>
              <button onClick={() => fetchResults()} className="px-4 py-2 text-xs font-medium rounded-[8px] bg-[#FF9500] text-white hover:bg-[#EA8500]">
                Try Again
              </button>
            </div>
          )}
        </>
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
