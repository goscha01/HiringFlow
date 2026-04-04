'use client'

import { useState, useEffect } from 'react'

interface Flow { id: string; name: string; slug: string }
interface AdTemplateItem { id: string; name: string; source: string; headline: string; bodyText: string; requirements: string | null; benefits: string | null; callToAction: string | null }
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

export default function CampaignsPage() {
  const [ads, setAds] = useState<Ad[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [adTemplates, setAdTemplates] = useState<AdTemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingAd, setEditingAd] = useState<Ad | null>(null)
  const [name, setName] = useState('')
  const [source, setSource] = useState('indeed')
  const [campaign, setCampaign] = useState('')
  const [flowId, setFlowId] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'ads' | 'sources' | 'links'>('ads')

  useEffect(() => {
    Promise.all([
      fetch('/api/ads').then(r => r.json()),
      fetch('/api/flows').then(r => r.json()),
      fetch('/api/ad-templates').then(r => r.json()).catch(() => []),
    ]).then(([a, f, t]) => { setAds(a); setFlows(f); setAdTemplates(t); setLoading(false) })
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

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  // Compute stats
  const totalSessions = ads.reduce((sum, a) => sum + a._count.sessions, 0)
  const activeAds = ads.filter(a => a.isActive).length
  const sourcesUsed = new Set(ads.map(a => a.source)).size

  // Sources breakdown
  const sourceStats = SOURCES.map(s => {
    const sourceAds = ads.filter(a => a.source === s.value)
    return {
      ...s,
      adCount: sourceAds.length,
      sessions: sourceAds.reduce((sum, a) => sum + a._count.sessions, 0),
      active: sourceAds.filter(a => a.isActive).length,
    }
  }).filter(s => s.adCount > 0).sort((a, b) => b.sessions - a.sessions)

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">Campaigns</h1>
          <p className="text-grey-35 mt-1">Manage hiring traffic — ads, sources, and tracked links</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ New Ad</button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-[8px] border border-surface-border p-4">
          <div className="text-[28px] font-bold text-grey-15">{ads.length}</div>
          <div className="text-xs text-grey-40">Total Ads</div>
        </div>
        <div className="bg-white rounded-[8px] border border-surface-border p-4">
          <div className="text-[28px] font-bold text-green-600">{activeAds}</div>
          <div className="text-xs text-grey-40">Active</div>
        </div>
        <div className="bg-white rounded-[8px] border border-surface-border p-4">
          <div className="text-[28px] font-bold text-grey-15">{totalSessions}</div>
          <div className="text-xs text-grey-40">Total Candidates</div>
        </div>
        <div className="bg-white rounded-[8px] border border-surface-border p-4">
          <div className="text-[28px] font-bold text-brand-500">{sourcesUsed}</div>
          <div className="text-xs text-grey-40">Sources Used</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-surface-border">
        {[
          { key: 'ads' as const, label: `Ads (${ads.length})` },
          { key: 'sources' as const, label: `Sources (${sourceStats.length})` },
          { key: 'links' as const, label: 'Tracked Links' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-500 text-brand-600' : 'border-transparent text-grey-40 hover:text-grey-20'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ADS TAB */}
      {tab === 'ads' && (
        <>
          {ads.length === 0 ? (
            <div className="section-card text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
                <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              </div>
              <h2 className="text-xl font-semibold text-grey-15 mb-2">No ads yet</h2>
              <p className="text-grey-35 mb-6">Create your first tracked ad to start tracking candidate sources</p>
              <button onClick={openCreate} className="btn-primary">+ New Ad</button>
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
                    <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Candidates</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {ads.map((ad) => (
                    <tr key={ad.id} className="hover:bg-surface-light">
                      <td className="px-5 py-4">
                        <div className="text-sm font-medium text-grey-15">{ad.name}</div>
                        <div className="text-xs text-grey-50 mt-0.5">{new Date(ad.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 font-medium capitalize">{ad.source}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-grey-35">{ad.flow.name}</td>
                      <td className="px-5 py-4 text-sm text-grey-40">{ad.campaign || '—'}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-grey-15 text-right">{ad._count.sessions}</td>
                      <td className="px-5 py-4">
                        <button onClick={() => toggleActive(ad)} className={`text-xs px-2.5 py-1 rounded-full font-medium ${ad.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-grey-40'}`}>
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
        </>
      )}

      {/* SOURCES TAB */}
      {tab === 'sources' && (
        <div className="bg-white rounded-lg border border-surface-border overflow-hidden">
          {sourceStats.length === 0 ? (
            <div className="text-center py-16 text-grey-40">No sources yet — create an ad to start tracking</div>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-surface-border bg-surface">
                  <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Source</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Ads</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Active</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Candidates</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {sourceStats.map(s => (
                  <tr key={s.value} className="hover:bg-surface-light">
                    <td className="px-5 py-4">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 font-medium">{s.label}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-grey-35 text-right">{s.adCount}</td>
                    <td className="px-5 py-4 text-sm text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.active > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-grey-40'}`}>{s.active}</span>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-grey-15 text-right">{s.sessions}</td>
                    <td className="px-5 py-4 text-sm text-grey-40 text-right">
                      {totalSessions > 0 ? `${Math.round((s.sessions / totalSessions) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TRACKED LINKS TAB */}
      {tab === 'links' && (
        <div className="space-y-3">
          {ads.length === 0 ? (
            <div className="bg-white rounded-[12px] border border-surface-border p-8 text-center text-grey-40">No tracked links yet</div>
          ) : ads.map(ad => (
            <div key={ad.id} className="bg-white rounded-[8px] border border-surface-border p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-grey-15">{ad.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 capitalize">{ad.source}</span>
                  {!ad.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-grey-40">Paused</span>}
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-grey-35 bg-surface px-2 py-1 rounded truncate">{baseUrl}/a/{ad.slug}</code>
                  <span className="text-xs text-grey-40 flex-shrink-0">{ad._count.sessions} candidates</span>
                </div>
              </div>
              <button
                onClick={() => copyLink(ad.slug, ad.id)}
                className={`ml-4 px-4 py-2 text-xs font-medium rounded-[8px] flex-shrink-0 transition-colors ${
                  copiedId === ad.id ? 'bg-green-100 text-green-700' : 'bg-brand-500 text-white hover:bg-brand-600'
                }`}
              >
                {copiedId === ad.id ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[480px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editingAd ? 'Edit Ad' : 'New Ad'}</h2>

            <div className="space-y-4">
              {/* Apply from template */}
              {!editingAd && adTemplates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Start from Ad Template</label>
                  <select
                    onChange={(e) => {
                      const t = adTemplates.find(t => t.id === e.target.value)
                      if (t) {
                        setName(t.name)
                        setSource(t.source === 'general' ? 'indeed' : t.source)
                        setCampaign(t.headline)
                      }
                    }}
                    className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Choose a template (optional)...</option>
                    {adTemplates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.source})</option>)}
                  </select>
                  <p className="text-xs text-grey-50 mt-1">Pre-fills name and source from your saved ad templates</p>
                </div>
              )}

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
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Assign to Flow</label>
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
                  <label className="block text-xs text-grey-40 mb-1">Tracked Link</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-grey-15 truncate">{baseUrl}/a/{editingAd.slug}</code>
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
