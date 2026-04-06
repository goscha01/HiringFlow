'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import Script from 'next/script'

export default function CandidateCallPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const agentId = params.slug as string
  const candidateName = searchParams.get('name') || ''

  return (
    <div className="min-h-screen bg-[#F7F7F8] flex flex-col" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
      {/* Header */}
      <div className="bg-white border-b border-[#F1F1F3] px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-semibold text-[#262626]">{candidateName ? `AI Call — ${candidateName}` : 'AI Voice Call'}</h1>
          <p className="text-xs text-[#59595A]">Click the call button below to start your voice session</p>
        </div>
      </div>

      {/* Widget area */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="mb-6">
            <div className="w-20 h-20 rounded-full bg-[#FFF7ED] flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-[#FF9500]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </div>
            <h2 className="text-xl font-semibold text-[#262626] mb-2">Ready to start</h2>
            <p className="text-sm text-[#59595A] max-w-md mx-auto">Use the call button in the bottom-right corner to start your voice conversation with the AI agent.</p>
          </div>
        </div>
      </div>

      {/* ElevenLabs Convai Widget */}
      <Script src="https://elevenlabs.io/convai-widget/index.js" strategy="afterInteractive" />
      {/* @ts-ignore */}
      <elevenlabs-convai agent-id={agentId}></elevenlabs-convai>
    </div>
  )
}
