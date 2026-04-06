'use client'

import { useState, useEffect } from 'react'

export default function AICallsPage() {
  const [agentId, setAgentId] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/workspace/settings').then(r => r.json()).then(d => {
      const settings = (d.settings || {}) as Record<string, string>
      if (settings.elevenlabs_agent_id) setAgentId(settings.elevenlabs_agent_id)
      setLoading(false)
    })
  }, [])

  const saveAgentId = async () => {
    await fetch('/api/workspace/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { elevenlabs_agent_id: agentId } }),
    })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const callLink = typeof window !== 'undefined' && agentId
    ? `${window.location.origin}/call/${agentId}`
    : ''

  const copyLink = () => {
    if (callLink) { navigator.clipboard.writeText(callLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">AI Calls</h1>
          <p className="text-grey-35 mt-1">Connect your ElevenLabs agent and share the call link with candidates</p>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Agent config */}
        <div className="bg-white rounded-[12px] border border-surface-border p-6">
          <h3 className="text-lg font-semibold text-grey-15 mb-4">ElevenLabs Agent</h3>
          <div>
            <label className="block text-sm font-medium text-grey-20 mb-1.5">Agent ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={agentId}
                onChange={e => setAgentId(e.target.value)}
                placeholder="agent_4501k18xybcmfrqatj21c99egrza"
                className="flex-1 px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button onClick={saveAgentId} disabled={!agentId.trim()} className="btn-primary px-6 disabled:opacity-50">
                {saved ? 'Saved!' : 'Save'}
              </button>
            </div>
            <p className="text-xs text-grey-50 mt-1">Find this in your ElevenLabs dashboard under Agents.</p>
          </div>
        </div>

        {/* Candidate link */}
        {agentId && (
          <div className="bg-white rounded-[12px] border border-surface-border p-6">
            <h3 className="text-lg font-semibold text-grey-15 mb-4">Candidate Call Link</h3>
            <p className="text-sm text-grey-35 mb-3">Share this link with candidates. They&apos;ll be able to start a voice call with your AI agent directly.</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-surface rounded-[8px] px-4 py-3 flex items-center">
                <code className="text-sm text-grey-15 truncate">{callLink}</code>
              </div>
              <button onClick={copyLink} className={`px-5 py-3 text-sm font-medium rounded-[8px] transition-colors ${copied ? 'bg-green-100 text-green-700' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="mt-4">
              <a href={callLink} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-500 hover:text-brand-600 font-medium">
                Test the call page →
              </a>
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="bg-surface rounded-[8px] border border-surface-border p-4">
          <p className="text-xs text-grey-40">
            Powered by ElevenLabs Conversational AI. The candidate opens the link, allows microphone access, and speaks with your configured AI agent. No account required for the candidate.
          </p>
        </div>
      </div>
    </div>
  )
}
