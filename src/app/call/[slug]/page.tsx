'use client'

import { useParams, useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useRef } from 'react'

export default function CandidateCallPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const agentId = params.slug as string
  const candidateName = searchParams.get('name') || ''
  const widgetContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Create widget element after script loads
    const createWidget = () => {
      if (!widgetContainerRef.current) return
      // Remove existing widget if any
      const existing = widgetContainerRef.current.querySelector('elevenlabs-convai')
      if (existing) existing.remove()

      const widget = document.createElement('elevenlabs-convai')
      widget.setAttribute('agent-id', agentId)
      widget.setAttribute('variant', 'expanded')
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
      // Make it fill the container
      widget.style.width = '100%'
      widget.style.height = '100%'
      widget.style.maxWidth = '100%'
      widget.style.position = 'absolute'
      widget.style.inset = '0'

      widgetContainerRef.current.appendChild(widget)
    }

    // Check if script already loaded
    if ((window as any).ElevenLabsConvai || document.querySelector('elevenlabs-convai')) {
      createWidget()
    } else {
      // Wait for script
      const interval = setInterval(() => {
        if (customElements.get('elevenlabs-convai')) {
          clearInterval(interval)
          createWidget()
        }
      }, 100)
      return () => clearInterval(interval)
    }
  }, [agentId, candidateName])

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
      </div>

      {/* Widget embedded centered */}
      <div className="flex-1 relative flex items-center justify-center" ref={widgetContainerRef}>
        {/* Widget will be inserted here */}
      </div>

      {/* Override widget styles — centered, large, white bg */}
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
