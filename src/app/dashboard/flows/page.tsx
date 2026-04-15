'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Flow {
  id: string
  name: string
  slug: string
  isPublished: boolean
  createdAt: string
  _count: {
    steps: number
    sessions: number
  }
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [showModal, setShowModal] = useState(false)
  const [newFlowName, setNewFlowName] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => { fetchFlows() }, [])

  const fetchFlows = async () => {
    const res = await fetch('/api/flows')
    if (res.ok) setFlows(await res.json())
  }

  const createFlow = async () => {
    if (!newFlowName.trim()) return
    setCreating(true)
    const res = await fetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFlowName }),
    })
    if (res.ok) {
      const flow = await res.json()
      setNewFlowName('')
      setShowModal(false)
      router.push(`/dashboard/flows/${flow.id}/builder?view=schema`)
      return
    }
    setCreating(false)
  }

  const togglePublish = async (flow: Flow) => {
    await fetch(`/api/flows/${flow.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !flow.isPublished }),
    })
    fetchFlows()
  }

  const copyShareUrl = (slug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/f/${slug}`)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 2000)
  }

  const deleteFlow = async (id: string) => {
    if (!confirm('Delete this flow?')) return
    await fetch(`/api/flows/${id}`, { method: 'DELETE' })
    fetchFlows()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">Screening</h1>
          <p className="text-grey-35 mt-1">Create and manage your candidate screening flows</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          + Create Flow
        </button>
      </div>

      {flows.length === 0 ? (
        <div className="section-card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-grey-15 mb-2">No flows yet</h2>
          <p className="text-grey-35 mb-6">Create your first application flow</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">+ Create Flow</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className="bg-white rounded-lg border border-surface-border overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => router.push(`/dashboard/flows/${flow.id}/builder?view=schema`)}
            >
              {/* Card header accent */}
              <div className="h-1.5 bg-brand-500" />

              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-grey-15 group-hover:text-brand-500 transition-colors">{flow.name}</h3>
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePublish(flow) }}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      flow.isPublished ? 'bg-green-100 text-green-700' : 'bg-surface text-grey-40'
                    }`}
                  >
                    {flow.isPublished ? 'Published' : 'Draft'}
                  </button>
                </div>

                <div className="text-sm text-grey-40 mb-4">/{flow.slug}</div>

                {/* Stats */}
                <div className="flex gap-6 mb-5">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-grey-15">{flow._count.steps}</div>
                    <div className="text-xs text-grey-40">Steps</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-grey-15">{flow._count.sessions}</div>
                    <div className="text-xs text-grey-40">Sessions</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-surface-border" onClick={(e) => e.stopPropagation()}>
                  <Link href={`/dashboard/flows/${flow.id}/builder?view=schema`} className="text-sm text-brand-500 hover:text-brand-600 font-medium">
                    Edit
                  </Link>
                  <Link href={`/dashboard/flows/${flow.id}/submissions`} className="text-sm text-grey-35 hover:text-grey-15">
                    Submissions
                  </Link>
                  <button onClick={() => copyShareUrl(flow.slug)} className="text-sm text-grey-35 hover:text-grey-15">
                    {copiedSlug === flow.slug ? 'Copied!' : 'Share'}
                  </button>
                  <button onClick={() => deleteFlow(flow.id)} className="text-sm text-red-500 hover:text-red-700 ml-auto">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">Create New Flow</h2>
            <input
              type="text"
              value={newFlowName}
              onChange={(e) => setNewFlowName(e.target.value)}
              placeholder="e.g. Sales Interview"
              className="w-full px-4 py-3 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-grey-15 placeholder-grey-50 mb-6"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createFlow()}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={createFlow} disabled={creating || !newFlowName.trim()} className="btn-primary flex-1 disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Flow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
