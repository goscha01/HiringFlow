'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useConversation } from '@elevenlabs/react'

interface CallConfig {
  id: string; name: string; agentId: string; requiredCalls: number; completedCalls: number
  calls: Array<{ id: string; callNumber: number; status: string; durationSecs: number | null; completedAt: string | null }>
}

export default function CandidateCallPage() {
  const params = useParams()
  const slug = params.slug as string

  const [config, setConfig] = useState<CallConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [started, setStarted] = useState(false)
  const [callActive, setCallActive] = useState(false)
  const [callId, setCallId] = useState<string | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([])
  const [allDone, setAllDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const conversation = useConversation({
    onConnect: () => {
      setCallActive(true)
      setCallDuration(0)
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000)
    },
    onDisconnect: () => {
      setCallActive(false)
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      // Complete the call
      if (callId) completeCall()
    },
    onMessage: (message: any) => {
      if (message.source === 'ai' || message.role === 'assistant') {
        setMessages(prev => [...prev, { role: 'agent', text: message.message || message.content || '' }])
      } else if (message.source === 'user' || message.role === 'user') {
        setMessages(prev => [...prev, { role: 'user', text: message.message || message.content || '' }])
      }
    },
    onError: (err: any) => {
      setError(typeof err === 'string' ? err : err?.message || 'Call error')
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

  const fetchConfig = async (email?: string) => {
    const url = email ? `/api/public/ai-calls/${slug}?email=${encodeURIComponent(email)}` : `/api/public/ai-calls/${slug}`
    const r = await fetch(url)
    if (r.ok) {
      const d = await r.json()
      setConfig(d)
      if (d.completedCalls >= d.requiredCalls) setAllDone(true)
    } else {
      setError('This call session is not available.')
    }
    setLoading(false)
  }

  useEffect(() => { fetchConfig() }, [slug])

  const handleStart = () => {
    if (!candidateName.trim() || !candidateEmail.trim()) return
    setStarted(true)
    fetchConfig(candidateEmail)
  }

  const startCall = async () => {
    if (!config) return
    setError('')
    setMessages([])

    try {
      // Log call start
      const res = await fetch(`/api/public/ai-calls/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', candidateName, candidateEmail }),
      })
      const { callId: newCallId } = await res.json()
      setCallId(newCallId)

      // Start voice session
      await navigator.mediaDevices.getUserMedia({ audio: true })
      await conversation.startSession({ agentId: config.agentId })
    } catch (err: any) {
      setError(err?.message || 'Failed to start. Please allow microphone access.')
    }
  }

  const endCall = async () => {
    await conversation.endSession()
  }

  const completeCall = async () => {
    if (!callId) return
    const res = await fetch(`/api/public/ai-calls/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'complete',
        callId,
        candidateEmail,
        durationSecs: callDuration,
        transcript: messages,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.allDone) setAllDone(true)
      fetchConfig(candidateEmail)
    }
    setCallId(null)
  }

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]"><div className="w-8 h-8 border-3 border-[#FF9500] border-t-transparent rounded-full animate-spin" /></div>

  if (error && !config) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
      <div className="bg-white rounded-[12px] p-12 max-w-lg text-center border border-[#F1F1F3]">
        <h1 className="text-[28px] font-semibold text-[#262626] mb-3">Not Available</h1>
        <p className="text-lg text-[#59595A]">{error}</p>
      </div>
    </div>
  )

  if (!config) return null

  // Intro screen — collect name + email
  if (!started) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FF9500] to-[#EA8500] p-4" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{config.name}</h1>
        <p className="text-gray-600 mb-6">Please enter your information to start the AI voice session.</p>
        <div className="space-y-3 text-left mb-6">
          <input type="text" value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="Your name" className="w-full px-4 py-3 border border-gray-300 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <input type="email" value={candidateEmail} onChange={e => setCandidateEmail(e.target.value)} placeholder="Your email" className="w-full px-4 py-3 border border-gray-300 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <button onClick={handleStart} disabled={!candidateName.trim() || !candidateEmail.trim()} className="w-full bg-brand-500 text-white py-4 rounded-[8px] font-semibold text-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
          Continue
        </button>
      </div>
    </div>
  )

  // All calls completed
  if (allDone) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8] p-4" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
      <div className="bg-white rounded-[12px] p-12 max-w-lg text-center border border-[#F1F1F3]">
        <div className="w-20 h-20 mx-auto mb-6 bg-green-50 rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h1 className="text-[28px] font-semibold text-[#262626] mb-3">All Done!</h1>
        <p className="text-lg text-[#59595A] mb-2">You&apos;ve completed all {config.requiredCalls} required call{config.requiredCalls > 1 ? 's' : ''}.</p>
        <p className="text-sm text-[#8A8A8C]">Thank you, {candidateName}. You can close this page now.</p>
      </div>
    </div>
  )

  // Call interface
  return (
    <div className="min-h-screen bg-[#F7F7F8] flex flex-col" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
      {/* Header */}
      <div className="bg-white border-b border-[#F1F1F3] px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#262626]">{config.name}</h1>
            <p className="text-xs text-[#59595A]">Call {config.completedCalls + 1} of {config.requiredCalls}</p>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: config.requiredCalls }).map((_, i) => (
              <div key={i} className={`w-8 h-2 rounded-full ${i < config.completedCalls ? 'bg-green-500' : i === config.completedCalls ? 'bg-brand-500' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Call area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          {callActive ? (
            <div className="bg-white rounded-[16px] border border-[#F1F1F3] p-8 text-center shadow-sm">
              <div className="relative mb-6 inline-block">
                <div className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 ${conversation.isSpeaking ? 'bg-brand-500 scale-110' : 'bg-brand-100'}`}>
                  <svg className={`w-12 h-12 ${conversation.isSpeaking ? 'text-white' : 'text-brand-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                </div>
                {conversation.isSpeaking && <div className="absolute inset-0 rounded-full border-4 border-brand-300 animate-ping opacity-30" />}
              </div>
              <p className="text-sm text-[#59595A] mb-1">{conversation.isSpeaking ? 'Agent is speaking...' : 'Listening to you...'}</p>
              <p className="text-xs text-[#8A8A8C] mb-8">{formatDuration(callDuration)}</p>

              <button onClick={endCall} className="px-8 py-3 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition-colors">
                End Call
              </button>

              {/* Live transcript */}
              {messages.length > 0 && (
                <div className="mt-6 pt-6 border-t border-[#F1F1F3] text-left max-h-[200px] overflow-y-auto">
                  {messages.map((m, i) => (
                    <div key={i} className={`mb-2 ${m.role === 'user' ? 'text-right' : ''}`}>
                      <span className={`inline-block text-sm px-3 py-1.5 rounded-[8px] ${m.role === 'agent' ? 'bg-[#F7F7F8] text-[#262626]' : 'bg-brand-500 text-white'}`}>
                        {m.text}
                      </span>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-[16px] border border-[#F1F1F3] p-8 text-center shadow-sm">
              <div className="w-20 h-20 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              </div>
              <h2 className="text-xl font-semibold text-[#262626] mb-2">Ready for Call {config.completedCalls + 1}</h2>
              <p className="text-sm text-[#59595A] mb-8">Click below to start your voice session with the AI agent. Make sure your microphone is ready.</p>

              {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

              <button onClick={startCall} className="px-8 py-4 bg-brand-500 text-white rounded-full font-semibold text-lg hover:bg-brand-600 transition-colors">
                Start Call
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
