'use client'

import { useState, useEffect } from 'react'

interface SchedulingConfig {
  id: string; name: string; provider: string; schedulingUrl: string
  isDefault: boolean; isActive: boolean; createdAt: string; updatedAt: string
  _count: { events: number }
}

export default function SchedulingPage() {
  const [configs, setConfigs] = useState<SchedulingConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<SchedulingConfig | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { refresh() }, [])

  const refresh = async () => {
    const r = await fetch('/api/scheduling')
    if (r.ok) setConfigs(await r.json())
    setLoading(false)
  }

  const openCreate = () => {
    setEditing(null); setName(''); setUrl(''); setIsDefault(configs.length === 0); setShowModal(true)
  }

  const openEdit = (c: SchedulingConfig) => {
    setEditing(c); setName(c.name); setUrl(c.schedulingUrl); setIsDefault(c.isDefault); setShowModal(true)
  }

  const save = async () => {
    if (!name.trim() || !url.trim()) return
    setSaving(true)
    const body = { name, schedulingUrl: url, isDefault }
    if (editing) {
      await fetch(`/api/scheduling/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else {
      await fetch('/api/scheduling', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setSaving(false); setShowModal(false); refresh()
  }

  const toggle = async (c: SchedulingConfig) => {
    await fetch(`/api/scheduling/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !c.isActive }) })
    refresh()
  }

  const setDefault = async (c: SchedulingConfig) => {
    await fetch(`/api/scheduling/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isDefault: true }) })
    refresh()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this scheduling config?')) return
    await fetch(`/api/scheduling/${id}`, { method: 'DELETE' }); refresh()
  }

  const isValidCalendlyUrl = (u: string) => {
    try { const parsed = new URL(u); return parsed.hostname.includes('calendly.com') } catch { return false }
  }

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">Scheduling</h1>
          <p className="text-grey-35 mt-1">Manage Calendly interview booking links</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ Add Calendly Link</button>
      </div>

      {configs.length === 0 ? (
        <div className="section-card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-grey-15 mb-2">No scheduling links yet</h2>
          <p className="text-grey-35 mb-4">Add your Calendly booking link to start scheduling candidates</p>
          <button onClick={openCreate} className="btn-primary">+ Add Calendly Link</button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-surface-border overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-surface-border bg-surface">
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Provider</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">URL</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Invites</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Default</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {configs.map((c) => (
                <tr key={c.id} className="hover:bg-surface-light">
                  <td className="px-5 py-4 text-sm font-medium text-grey-15">{c.name}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium capitalize">{c.provider}</span>
                  </td>
                  <td className="px-5 py-4 text-sm text-grey-35 max-w-[250px] truncate">
                    <a href={c.schedulingUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand-500 underline">
                      {c.schedulingUrl}
                    </a>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-grey-15">{c._count.events}</td>
                  <td className="px-5 py-4">
                    {c.isDefault ? (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 font-medium">Default</span>
                    ) : (
                      <button onClick={() => setDefault(c)} className="text-xs text-grey-40 hover:text-brand-500">Set default</button>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <button onClick={() => toggle(c)} className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-grey-40'}`}>
                      {c.isActive ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right space-x-3">
                    <button onClick={() => openEdit(c)} className="text-xs text-grey-35 hover:text-grey-15">Edit</button>
                    <button onClick={() => remove(c.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[520px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editing ? 'Edit Scheduling Link' : 'Add Scheduling Link'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. General Interview" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Provider</label>
                <div className="px-4 py-3 border border-surface-border rounded-[8px] bg-surface text-grey-35 text-sm">
                  Calendly
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Calendly URL</label>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendly.com/your-name/interview" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                {url && !isValidCalendlyUrl(url) && (
                  <p className="text-xs text-amber-600 mt-1">URL should be a calendly.com link</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsDefault(!isDefault)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${isDefault ? 'bg-brand-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isDefault ? 'left-5' : 'left-0.5'}`} />
                </button>
                <span className="text-sm text-grey-20">Set as default scheduling link</span>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim() || !url.trim()} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
