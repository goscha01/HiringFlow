'use client'

import { useState, useEffect } from 'react'

interface Flow { id: string; name: string; slug: string }
interface Ad {
  id: string; name: string; source: string; campaign: string | null
  slug: string; isActive: boolean; flowId: string
  flow: Flow; createdAt: string; _count: { sessions: number }
}

const SOURCES = [
  { value: 'indeed', label: 'Indeed' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'craigslist', label: 'Craigslist' },
  { value: 'google', label: 'Google' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'referral', label: 'Referral' },
  { value: 'other', label: 'Other' },
]

export default function AdsPage() {
  const [ads, setAds] = useState<Ad[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingAd, setEditingAd] = useState<Ad | null>(null)
  const [name, setName] = useState('')
  const [source, setSource] = useState('indeed')
  const [campaign, setCampaign] = useState('')
  const [flowId, setFlowId] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/ads').then(r => r.json()),
      fetch('/api/flows').then(r => r.json()),
    ]).then(([a, f]) => { setAds(a); setFlows(f); setLoading(false) })
  }, [])

  const refresh = async () => { const r = await fetch('/api/ads'); if (r.ok) setAds(await r.json()) }

  const openCreate = () => {
    setEditingAd(null); setName(''); setSource('indeed'); setCampaign(''); setFlowId(flows[0]?.id || ''); setShowModal(true)
  }

  const openEdit = (ad: Ad) => {
    setEditingAd(ad); setName(ad.name); setSource(ad.source); setCampaign(ad.campaign || ''); setFlowId(ad.flowId); setShowModal(true)
  }

  const save = async () => {
    if (!name.trim() || !flowId) return
    setSaving(true)
    if (editingAd) {
      await fetch(`/api/ads/${editingAd.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, source, campaign, flowId }) })
    } else {
      await fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, source, campaign, flowId }) })
    }
    setSaving(false); setShowModal(false); refresh()
  }

  const toggleActive = async (ad: Ad) => {
    await fetch(`/api/ads/${ad.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !ad.isActive }) })
    refresh()
  }

  const deleteAd = async (id: string) => {
    if (!confirm('Delete this ad?')) return
    await fetch(`/api/ads/${id}`, { method: 'DELETE' }); refresh()
  }

  const copyLink = (slug: string, id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/a/${slug}`)
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">Ads</h1>
          <p className="text-grey-35 mt-1">Create tracked links for your application flows</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ Create Ad</button>
      </div>

      {ads.length === 0 ? (
        <div className="section-card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-grey-15 mb-2">No ads yet</h2>
          <p className="text-grey-35 mb-6">Create your first tracked link to a flow</p>
          <button onClick={openCreate} className="btn-primary">+ Create Ad</button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-surface-border overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-surface-border bg-surface">
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Source</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Flow</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Campaign</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Sessions</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {ads.map((ad) => (
                <tr key={ad.id} className="hover:bg-surface-light">
                  <td className="px-5 py-4">
                    <div className="text-sm font-medium text-grey-15">{ad.name}</div>
                    <div className="text-xs text-grey-40 mt-0.5">/a/{ad.slug}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 font-medium capitalize">{ad.source}</span>
                  </td>
                  <td className="px-5 py-4 text-sm text-grey-35">{ad.flow.name}</td>
                  <td className="px-5 py-4 text-sm text-grey-40">{ad.campaign || '—'}</td>
                  <td className="px-5 py-4 text-sm font-medium text-grey-15">{ad._count.sessions}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => toggleActive(ad)} className={`text-xs px-2.5 py-1 rounded-full font-medium ${ad.isActive ? 'bg-green-100 text-green-700' : 'bg-grey-100 text-grey-40'}`}>
                      {ad.isActive ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right space-x-3">
                    <button onClick={() => copyLink(ad.slug, ad.id)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">
                      {copiedId === ad.id ? 'Copied!' : 'Copy Link'}
                    </button>
                    <button onClick={() => openEdit(ad)} className="text-xs text-grey-35 hover:text-grey-15">Edit</button>
                    <button onClick={() => deleteAd(ad.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[480px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editingAd ? 'Edit Ad' : 'Create Ad'}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Ad Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Indeed Cleaner Ad - Miami" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" autoFocus />
              </div>

              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Source</label>
                <div className="grid grid-cols-3 gap-2">
                  {SOURCES.map(({ value, label }) => (
                    <button key={value} onClick={() => setSource(value)} className={`py-2 text-xs rounded-[8px] border font-medium ${source === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35 hover:bg-surface'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Flow</label>
                <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Select flow...</option>
                  {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Campaign / Group (optional)</label>
                <input type="text" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. Q1 Hiring, Miami Market" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              {editingAd && (
                <div className="bg-surface rounded-[8px] p-3">
                  <label className="block text-xs text-grey-40 mb-1">Public Link</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-grey-15 truncate">{typeof window !== 'undefined' ? window.location.origin : ''}/a/{editingAd.slug}</code>
                    <button onClick={() => copyLink(editingAd.slug, editingAd.id)} className="text-xs text-brand-500 hover:text-brand-600 flex-shrink-0">{copiedId === editingAd.id ? 'Copied!' : 'Copy'}</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim() || !flowId} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Saving...' : editingAd ? 'Save Changes' : 'Create Ad'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
