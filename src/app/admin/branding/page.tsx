'use client'

import { useState, useEffect } from 'react'
import BrandingEditor from '@/components/BrandingEditor'
import { type BrandingConfig } from '@/lib/branding'

export default function BrandingPage() {
  const [flows, setFlows] = useState<Array<{ id: string; name: string; branding: Record<string, unknown> | null; startMessage: string; endMessage: string }>>([])
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/flows')
      .then((r) => r.json())
      .then((data) => {
        setFlows(data)
        if (data.length > 0) setSelectedFlowId(data[0].id)
        setLoading(false)
      })
  }, [])

  const selectedFlow = flows.find((f) => f.id === selectedFlowId)

  const handleUpdate = async (branding: BrandingConfig) => {
    if (!selectedFlowId) return
    await fetch(`/api/flows/${selectedFlowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branding }),
    })
    setFlows((prev) =>
      prev.map((f) => (f.id === selectedFlowId ? { ...f, branding: branding as unknown as Record<string, unknown> } : f))
    )
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>
  }

  if (flows.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Branding</h1>
        <p className="text-gray-500">Create a flow first to customize its branding.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Branding</h1>
        <select
          value={selectedFlowId || ''}
          onChange={(e) => setSelectedFlowId(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {flows.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {selectedFlow && (
        <BrandingEditor
          branding={selectedFlow.branding as Partial<BrandingConfig> | null}
          onUpdate={handleUpdate}
          flowName={selectedFlow.name}
          startMessage={selectedFlow.startMessage}
          endMessage={selectedFlow.endMessage}
        />
      )}
    </div>
  )
}
