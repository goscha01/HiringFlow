/**
 * Flows list — refreshed to match Design/design_handoff_hirefunnel.
 * Filter pills + 3-col card grid with gradient cover, status badge, slug in
 * mono, and bottom-row metadata.
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge, Button, Card, Eyebrow, PageHeader } from '@/components/design'

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

type Filter = 'all' | 'published' | 'draft'

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [showModal, setShowModal] = useState(false)
  const [newFlowName, setNewFlowName] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<Flow | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
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

  const openRename = (flow: Flow) => {
    setRenameTarget(flow)
    setRenameValue(flow.name)
  }

  const submitRename = async () => {
    if (!renameTarget || !renameValue.trim() || renameValue.trim() === renameTarget.name) {
      setRenameTarget(null)
      return
    }
    setRenaming(true)
    const res = await fetch(`/api/flows/${renameTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameValue.trim() }),
    })
    setRenaming(false)
    if (res.ok) {
      setRenameTarget(null)
      fetchFlows()
    }
  }

  const visible = flows.filter((f) =>
    filter === 'all' ? true : filter === 'published' ? f.isPublished : !f.isPublished
  )

  return (
    <div className="-mx-6 lg:-mx-[132px]">
      <PageHeader
        eyebrow={`${flows.length} flow${flows.length === 1 ? '' : 's'}`}
        title="Screening"
        description="Branching video interviews. Build, publish, share."
        actions={
          <Button onClick={() => setShowModal(true)} size="sm">+ New flow</Button>
        }
      />

      <div className="px-8 py-6">
        {/* Filter pills */}
        <div className="flex gap-2 mb-6">
          {([
            { v: 'all' as const, l: `All (${flows.length})` },
            { v: 'published' as const, l: `Published (${flows.filter(f => f.isPublished).length})` },
            { v: 'draft' as const, l: `Draft (${flows.filter(f => !f.isPublished).length})` },
          ]).map((o) => (
            <button
              key={o.v}
              onClick={() => setFilter(o.v)}
              className={`px-3.5 py-1.5 rounded-full border text-[12px] font-medium transition-colors ${
                filter === o.v
                  ? 'bg-ink text-white border-ink'
                  : 'border-surface-border text-ink bg-white hover:bg-surface-light'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <Card padding={48} className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-xl flex items-center justify-center">
              <svg className="w-8 h-8" style={{ color: 'var(--brand-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-[20px] font-semibold text-ink mb-2">No flows yet</h2>
            <p className="text-grey-35 mb-5 text-[14px]">Create your first application flow.</p>
            <Button onClick={() => setShowModal(true)} size="sm">+ New flow</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {visible.map((flow) => (
              <Card
                key={flow.id}
                padding={0}
                className="overflow-hidden cursor-pointer hover:shadow-card transition-shadow"
                onClick={() => router.push(`/dashboard/flows/${flow.id}/builder?view=schema`)}
              >
                {/* Gradient cover with meta overlay */}
                <div
                  className="relative"
                  style={{
                    height: 120,
                    background: `linear-gradient(135deg, rgba(255,149,0,0.18), rgba(255,149,0,0.06)),
                      repeating-linear-gradient(135deg, rgba(26,24,21,0.04) 0 10px, transparent 10px 20px)`,
                  }}
                >
                  <div className="absolute top-3 right-3" onClick={(e) => { e.stopPropagation(); togglePublish(flow) }}>
                    <Badge tone={flow.isPublished ? 'success' : 'warn'}>
                      {flow.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  <div className="absolute bottom-3 left-3.5">
                    <Eyebrow size="xs">{flow._count.steps} step{flow._count.steps === 1 ? '' : 's'} · {flow._count.sessions} candidate{flow._count.sessions === 1 ? '' : 's'}</Eyebrow>
                  </div>
                </div>
                {/* Body */}
                <div className="p-4">
                  <div className="text-[15px] font-semibold text-ink mb-1">{flow.name}</div>
                  <div className="font-mono text-[11px] text-grey-35 mb-4">/f/{flow.slug}</div>
                  <div className="flex justify-between text-[12px] text-grey-35 pt-3 border-t border-surface-divider" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-3">
                      <Link href={`/dashboard/flows/${flow.id}/builder?view=schema`} className="font-medium hover:text-ink">Edit</Link>
                      <button onClick={() => openRename(flow)} className="hover:text-ink">Rename</button>
                      <Link href={`/dashboard/flows/${flow.id}/submissions`} className="hover:text-ink">Submissions</Link>
                      <button onClick={() => copyShareUrl(flow.slug)} className="hover:text-ink">
                        {copiedSlug === flow.slug ? 'Copied' : 'Share'}
                      </button>
                    </div>
                    <button onClick={() => deleteFlow(flow.id)} className="hover:text-[color:var(--danger-fg)]">Delete</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Rename modal */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setRenameTarget(null)}>
          <div className="bg-white rounded-xl border border-surface-border p-7 w-full max-w-md shadow-raised" onClick={(e) => e.stopPropagation()}>
            <Eyebrow size="xs" className="mb-1.5">Rename flow</Eyebrow>
            <h2 className="text-[20px] font-semibold text-ink mb-5">Edit flow name</h2>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full px-4 py-3 border border-surface-border rounded-[10px] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 text-ink placeholder-grey-50 mb-6 text-[14px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename()
                if (e.key === 'Escape') setRenameTarget(null)
              }}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setRenameTarget(null)}>Cancel</Button>
              <Button onClick={submitRename} disabled={renaming || !renameValue.trim()}>
                {renaming ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-surface-border p-7 w-full max-w-md shadow-raised" onClick={(e) => e.stopPropagation()}>
            <Eyebrow size="xs" className="mb-1.5">New flow</Eyebrow>
            <h2 className="text-[20px] font-semibold text-ink mb-5">Name this flow</h2>
            <input
              type="text"
              value={newFlowName}
              onChange={(e) => setNewFlowName(e.target.value)}
              placeholder="e.g. Senior Product Designer"
              className="w-full px-4 py-3 border border-surface-border rounded-[10px] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 text-ink placeholder-grey-50 mb-6 text-[14px]"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createFlow()}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={createFlow} disabled={creating || !newFlowName.trim()}>
                {creating ? 'Creating…' : 'Create flow'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
