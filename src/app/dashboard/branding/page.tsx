'use client'

import { useState, useEffect } from 'react'
import BrandingEditor from '@/components/BrandingEditor'
import { type BrandingConfig } from '@/lib/branding'
import { PageHeader } from '@/components/design'

interface Item {
  id: string
  name: string
  branding: Record<string, unknown> | null
  startMessage: string
  endMessage: string
  type: 'flow' | 'training'
}

export default function BrandingPage() {
  const [tab, setTab] = useState<'flows' | 'trainings'>('flows')
  const [flows, setFlows] = useState<Item[]>([])
  const [trainings, setTrainings] = useState<Item[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/flows').then((r) => r.json()),
      fetch('/api/trainings').then((r) => r.json()),
    ]).then(([flowData, trainingData]) => {
      const f = flowData.map((d: Record<string, unknown>) => ({
        id: d.id, name: d.name, branding: d.branding || null,
        startMessage: d.startMessage || '', endMessage: d.endMessage || '', type: 'flow',
      })) as Item[]
      const t = trainingData.map((d: Record<string, unknown>) => ({
        id: d.id, name: d.title, branding: d.branding || null,
        startMessage: '', endMessage: '', type: 'training',
      })) as Item[]
      setFlows(f)
      setTrainings(t)
      if (f.length > 0) setSelectedId(f[0].id)
      else if (t.length > 0) { setTab('trainings'); setSelectedId(t[0].id) }
      setLoading(false)
    })
  }, [])

  const items = tab === 'flows' ? flows : trainings
  const selected = items.find((i) => i.id === selectedId)

  const handleUpdate = async (branding: BrandingConfig) => {
    if (!selectedId) return
    const endpoint = tab === 'flows' ? `/api/flows/${selectedId}` : `/api/trainings/${selectedId}`
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branding }),
    })
    const setter = tab === 'flows' ? setFlows : setTrainings
    setter((prev) => prev.map((i) => i.id === selectedId ? { ...i, branding: branding as unknown as Record<string, unknown> } : i))
  }

  if (loading) return <div className="py-14 text-center font-mono text-[11px] uppercase text-grey-35" style={{ letterSpacing: '0.1em' }}>Loading…</div>

  return (
    <div className="-mx-6 lg:-mx-[132px]">
      <PageHeader
        eyebrow={`${tab === 'flows' ? flows.length : trainings.length} ${tab}`}
        title="Branding"
        description="Customize logo, colors, typography, and copy per flow or training."
        actions={
          <>
            {/* Type toggle */}
            <div className="inline-flex rounded-[10px] border border-surface-border overflow-hidden">
              <button
                onClick={() => { setTab('flows'); if (flows.length > 0) setSelectedId(flows[0].id) }}
                className={`px-3 py-1.5 text-[12px] font-medium ${
                  tab === 'flows' ? 'text-white' : 'bg-white text-grey-35 hover:bg-surface-light'
                }`}
                style={tab === 'flows' ? { background: 'var(--brand-primary)' } : undefined}
              >
                Flows ({flows.length})
              </button>
              <button
                onClick={() => { setTab('trainings'); if (trainings.length > 0) setSelectedId(trainings[0].id) }}
                className={`px-3 py-1.5 text-[12px] font-medium ${
                  tab === 'trainings' ? 'text-white' : 'bg-white text-grey-35 hover:bg-surface-light'
                }`}
                style={tab === 'trainings' ? { background: 'var(--brand-primary)' } : undefined}
              >
                Trainings ({trainings.length})
              </button>
            </div>
            {items.length > 0 && (
              <select
                value={selectedId || ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="px-3 py-1.5 border border-surface-border rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            )}
          </>
        }
      />

      <div className="px-8 py-6">
        {items.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-border p-12 text-center">
            <p className="text-grey-35 text-[13px]">No {tab} yet. Create one first to customize its branding.</p>
          </div>
        ) : selected ? (
          <BrandingEditor
            branding={selected.branding as Partial<BrandingConfig> | null}
            onUpdate={handleUpdate}
            flowName={selected.name}
            startMessage={selected.startMessage}
            endMessage={selected.endMessage}
          />
        ) : null}
      </div>
    </div>
  )
}
