'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface CallConfig {
  id: string; name: string; slug: string; agentId: string; requiredCalls: number
  isActive: boolean; createdAt: string; _count: { calls: number }; completedCalls: number
}

export default function AICallsPage() {
  const [configs, setConfigs] = useState<CallConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [agentId, setAgentId] = useState('agent_4501k18xybcmfrqatj21c99egrza')
  const [requiredCalls, setRequiredCalls] = useState(1)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => { refresh() }, [])

  const refresh = async () => {
    const r = await fetch('/api/ai-calls')
    if (r.ok) setConfigs(await r.json())
    setLoading(false)
  }

  const create = async () => {
    if (!name.trim() || !agentId.trim()) return
    setSaving(true)
    await fetch('/api/ai-calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, agentId, requiredCalls }),
    })
    setSaving(false); setShowModal(false); setName(''); refresh()
  }

  const toggle = async (c: CallConfig) => {
    await fetch(`/api/ai-calls/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    })
    refresh()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this AI call config?')) return
    await fetch(`/api/ai-calls/${id}`, { method: 'DELETE' })
    refresh()
  }

  const copyLink = (slug: string, id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/call/${slug}`)
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">AI Calls</h1>
          <p className="text-grey-35 mt-1">AI voice agent sessions for candidate training and screening</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">+ New AI Call</button>
      </div>

      {configs.length === 0 ? (
        <div className="section-card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-grey-15 mb-2">No AI call configs yet</h2>
          <p className="text-grey-35 mb-6">Create an AI call session to generate a link for candidates</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">+ New AI Call</button>
        </div>
      ) : (
        <div className="space-y-4">
          {configs.map(c => (
            <div key={c.id} className="bg-white rounded-[12px] border border-surface-border p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-grey-15">{c.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-grey-40'}`}>
                      {c.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-sm text-grey-40">Required calls: {c.requiredCalls} &middot; Total calls: {c._count.calls} &middot; Completed: {c.completedCalls}</p>
                  <p className="text-xs text-grey-50 mt-1">Agent: {c.agentId}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => copyLink(c.slug, c.id)} className={`text-xs px-3 py-1.5 rounded-[6px] font-medium ${copiedId === c.id ? 'bg-green-100 text-green-700' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                    {copiedId === c.id ? 'Copied!' : 'Copy Link'}
                  </button>
                  <Link href={`/call/${c.slug}`} target="_blank" className="text-xs text-purple-500 hover:text-purple-600 font-medium">Preview</Link>
                  <button onClick={() => toggle(c)} className="text-xs text-grey-35 hover:text-grey-15">{c.isActive ? 'Pause' : 'Activate'}</button>
                  <button onClick={() => remove(c.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
                </div>
              </div>

              {/* Call stats */}
              {c._count.calls > 0 && (
                <div className="mt-3 pt-3 border-t border-surface-border flex gap-4">
                  <div className="text-center">
                    <div className="text-xl font-bold text-grey-15">{c._count.calls}</div>
                    <div className="text-xs text-grey-40">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600">{c.completedCalls}</div>
                    <div className="text-xs text-grey-40">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-brand-500">{c.requiredCalls > 0 ? Math.round((c.completedCalls / Math.max(c._count.calls, 1)) * 100) : 0}%</div>
                    <div className="text-xs text-grey-40">Completion Rate</div>
                  </div>
                  <Link href={`/dashboard/ai-calls/${c.id}`} className="ml-auto text-sm text-brand-500 hover:text-brand-600 font-medium self-center">
                    View Details →
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[480px]" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">New AI Call Session</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Client Training Call" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">ElevenLabs Agent ID</label>
                <input type="text" value={agentId} onChange={e => setAgentId(e.target.value)} placeholder="agent_xxx" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Required Calls</label>
                <input type="number" min={1} max={10} value={requiredCalls} onChange={e => setRequiredCalls(Number(e.target.value))} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <p className="text-xs text-grey-50 mt-1">Number of calls a candidate must complete</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={create} disabled={saving || !name.trim() || !agentId.trim()} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
