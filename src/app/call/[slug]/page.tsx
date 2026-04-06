'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useConversation } from '@elevenlabs/react'

export default function CandidateCallPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const agentId = params.slug as string
  const candidateName = searchParams.get('name') || ''

  const [callActive, setCallActive] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const conversation = useConversation({
    onConnect: () => {
      setCallActive(true)
      setCallDuration(0)
      setError('')
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000)
    },
    onDisconnect: () => {
      setCallActive(false)
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    },
    onMessage: (message: any) => {
      const text = message.message || message.content || ''
      if (!text) return
      if (message.source === 'ai' || message.role === 'assistant') {
        setMessages(prev => [...prev, { role: 'agent', text }])
      } else if (message.source === 'user' || message.role === 'user') {
        setMessages(prev => [...prev, { role: 'user', text }])
      }
    },
    onError: (err: any) => {
      setError(typeof err === 'string' ? err : err?.message || 'Connection error')
      setCallActive(false)
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const startCall = async () => {
    try {
      setError('')
      setMessages([])
      await navigator.mediaDevices.getUserMedia({ audio: true })
      await conversation.startSession({ agentId })
    } catch (err: any) {
      setError(err?.message || 'Failed to start. Please allow microphone access.')
    }
  }

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-[#F7F7F8] flex flex-col" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
      {/* Header */}
      <div className="bg-white border-b border-[#F1F1F3] px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[#262626]">{candidateName ? `AI Call — ${candidateName}` : 'AI Voice Call'}</h1>
          {callActive && <span className="text-sm text-[#59595A]">{formatDuration(callDuration)}</span>}
        </div>
      </div>

      {/* Call area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <div className="bg-white rounded-[16px] border border-[#F1F1F3] p-8 text-center shadow-sm">
            {callActive ? (
              <>
                <div className="relative mb-6 inline-block">
                  <div className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 ${conversation.isSpeaking ? 'bg-[#FF9500] scale-110' : 'bg-[#FFF7ED]'}`}>
                    <svg className={`w-12 h-12 ${conversation.isSpeaking ? 'text-white' : 'text-[#FF9500]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </div>
                  {conversation.isSpeaking && <div className="absolute inset-0 rounded-full border-4 border-[#FFD699] animate-ping opacity-30" />}
                </div>
                <p className="text-sm text-[#59595A] mb-8">{conversation.isSpeaking ? 'Agent is speaking...' : 'Listening...'}</p>
                <button onClick={() => conversation.endSession()} className="px-8 py-3 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition-colors">
                  End Call
                </button>
              </>
            ) : (
              <>
                <div className="w-24 h-24 rounded-full bg-[#FFF7ED] flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-[#FF9500]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </div>
                <h2 className="text-xl font-semibold text-[#262626] mb-2">Ready to talk</h2>
                <p className="text-sm text-[#59595A] mb-8">Click below to start a voice call. Make sure your microphone is enabled.</p>
                {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
                <button onClick={startCall} className="px-8 py-4 bg-[#FF9500] text-white rounded-full font-semibold text-lg hover:bg-[#EA8500] transition-colors">
                  Start Call
                </button>
              </>
            )}
          </div>

          {/* Transcript */}
          {messages.length > 0 && (
            <div className="bg-white rounded-[12px] border border-[#F1F1F3] mt-4 overflow-hidden">
              <div className="px-4 py-2 bg-[#F7F7F8] border-b border-[#F1F1F3]">
                <span className="text-xs font-medium text-[#8A8A8C] uppercase">Transcript</span>
              </div>
              <div className="px-4 py-3 max-h-[250px] overflow-y-auto space-y-2">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}>
                    <span className={`inline-block text-sm px-3 py-1.5 rounded-[8px] max-w-[80%] ${
                      m.role === 'agent' ? 'bg-[#F7F7F8] text-[#262626]' : 'bg-[#FF9500] text-white'
                    }`}>{m.text}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
