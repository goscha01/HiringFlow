'use client'

import { useState, useEffect } from 'react'
import BrandingEditor from '@/components/BrandingEditor'
import { type BrandingConfig } from '@/lib/branding'

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
      fetch('/api/flows').then(r => r.json()),
      fetch('/api/trainings').then(r => r.json()),
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
  const selected = items.find(i => i.id === selectedId)

  const handleUpdate = async (branding: BrandingConfig) => {
    if (!selectedId) return
    const endpoint = tab === 'flows' ? `/api/flows/${selectedId}` : `/api/trainings/${selectedId}`
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branding }),
    })
    const setter = tab === 'flows' ? setFlows : setTrainings
    setter(prev => prev.map(i => i.id === selectedId ? { ...i, branding: branding as unknown as Record<string, unknown> } : i))
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Branding</h1>
          {/* Flows / Trainings tabs */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => { setTab('flows'); if (flows.length > 0) setSelectedId(flows[0].id) }}
              className={`px-4 py-1.5 text-sm font-medium ${
                tab === 'flows' ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Flows ({flows.length})
            </button>
            <button
              onClick={() => { setTab('trainings'); if (trainings.length > 0) setSelectedId(trainings[0].id) }}
              className={`px-4 py-1.5 text-sm font-medium ${
                tab === 'trainings' ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Trainings ({trainings.length})
            </button>
          </div>
        </div>
        {items.length > 0 && (
          <select
            value={selectedId || ''}
            onChange={(e) => setSelectedId(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No {tab} yet. Create one first to customize its branding.</p>
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
  )
}
