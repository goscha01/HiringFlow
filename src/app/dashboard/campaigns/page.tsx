'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button, Card, Eyebrow, PageHeader, Stat } from '@/components/design'

interface Flow { id: string; name: string; slug: string; isPublished?: boolean }
interface AdTemplateItem { id: string; name: string; source: string; headline: string; bodyText: string; requirements: string | null; benefits: string | null; callToAction: string | null }
interface Picture { id: string; url: string; filename: string; displayName?: string | null }
interface Ad {
  id: string; name: string; source: string; campaign: string | null
  slug: string; isActive: boolean; flowId: string; imageUrl: string | null
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
  { value: 'telegram', label: 'Telegram' },
  { value: 'referral', label: 'Referral' },
  { value: 'other', label: 'Other' },
]

const DEFAULT_AD_COPY: Record<string, { headline: string; body: string; requirements: string; benefits: string; cta: string }> = {
  indeed: { headline: 'Now Hiring — Join Our Team!', body: 'We are looking for motivated team members to join our growing company.\n\nThis is a great opportunity for someone who wants to grow their career.', requirements: '- Must be authorized to work\n- Reliable transportation\n- Positive attitude', benefits: '- Competitive pay\n- Flexible schedule\n- Growth opportunities', cta: 'Apply now — takes less than 5 minutes!' },
  facebook: { headline: "We're Hiring! Come Work With Us", body: "Looking for your next gig? We're hiring and we'd love to hear from you.\n\nNo long applications. Just a quick intro and you could start next week.", requirements: '', benefits: '- Weekly pay\n- Friendly team\n- No experience needed', cta: 'Tap the link to apply — it only takes a few minutes!' },
  craigslist: { headline: 'HIRING NOW — Apply Today', body: 'Immediate openings available.\n\nWe are looking for reliable, hardworking individuals. Full-time and part-time positions.', requirements: '- Must be 18+\n- Background check required\n- Valid ID', benefits: '- Start ASAP\n- Paid training\n- Weekly pay', cta: 'Click the link below to apply online.' },
  _default: { headline: 'We Are Hiring!', body: 'Join our team! We have openings available and are looking for great people.', requirements: '', benefits: '- Competitive pay\n- Great team', cta: 'Apply now through our quick online process!' },
}

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
  // Ad copy fields in modal
  const [adHeadline, setAdHeadline] = useState('')
  const [adBody, setAdBody] = useState('')
  const [adCta, setAdCta] = useState('')
  const [showAdCopy, setShowAdCopy] = useState(true)
  // Duplicate modal
  const [duplicatingAd, setDuplicatingAd] = useState<Ad | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  // Image picker
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const [pictures, setPictures] = useState<Picture[]>([])
  const [picturesLoading, setPicturesLoading] = useState(false)
  // Template selection + editor
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('__default__')
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<AdTemplateItem | null>(null)
  const [tplName, setTplName] = useState('')
  const [tplSource, setTplSource] = useState('general')
  const [tplHeadline, setTplHeadline] = useState('')
  const [tplBody, setTplBody] = useState('')
  const [tplRequirements, setTplRequirements] = useState('')
  const [tplBenefits, setTplBenefits] = useState('')
  const [tplCta, setTplCta] = useState('')
  const [tplSaving, setTplSaving] = useState(false)
  const [tplDeleting, setTplDeleting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/ads').then(r => r.json()),
      fetch('/api/flows').then(r => r.json()),
      fetch('/api/ad-templates').then(r => r.json()).catch(() => []),
    ]).then(async ([a, f, t]) => {
      setAds(a); setFlows(f); setLoading(false)
      // Auto-seed starter templates the first time this workspace opens the page
      if (Array.isArray(t) && t.length === 0) {
        const seeded = await fetch('/api/ad-templates/seed', { method: 'POST' })
        if (seeded.ok) {
          const r2 = await fetch('/api/ad-templates')
          if (r2.ok) { setAdTemplates(await r2.json()); return }
        }
      }
      setAdTemplates(t)
    })
  }, [])

  const refresh = async () => { const r = await fetch('/api/ads'); if (r.ok) setAds(await r.json()) }

  const loadAdCopyDefaults = (src: string) => {
    const d = DEFAULT_AD_COPY[src] || DEFAULT_AD_COPY._default
    setAdHeadline(d.headline); setAdBody(d.body); setAdCta(d.cta)
  }

  const openCreate = () => {
    setEditingAd(null); setName(''); setSource('indeed'); setCampaign(''); setFlowId(flows[0]?.id || '')
    setImageUrl(null); setImageError(null); setShowLibrary(false)
    setSelectedTemplateId('__default__')
    const d = DEFAULT_AD_COPY.indeed
    setAdHeadline(d.headline); setAdBody(d.body); setAdCta(d.cta)
    setShowAdCopy(true); setShowModal(true)
  }
  const openEdit = (ad: Ad) => {
    setEditingAd(ad); setName(ad.name); setSource(ad.source); setCampaign(ad.campaign || ''); setFlowId(ad.flowId)
    setImageUrl(ad.imageUrl); setImageError(null); setShowLibrary(false)
    setSelectedTemplateId('__default__')
    setShowModal(true)
  }

  const refreshTemplates = async () => {
    const r = await fetch('/api/ad-templates')
    if (r.ok) setAdTemplates(await r.json())
  }

  const openTemplateNew = () => {
    setEditingTemplate(null)
    setTplName(''); setTplSource(source || 'general')
    setTplHeadline(adHeadline); setTplBody(adBody); setTplCta(adCta)
    setTplRequirements(''); setTplBenefits('')
    setTemplateEditorOpen(true)
  }

  const openTemplateEdit = () => {
    const t = adTemplates.find(t => t.id === selectedTemplateId)
    if (!t) return
    setEditingTemplate(t)
    setTplName(t.name); setTplSource(t.source)
    setTplHeadline(t.headline); setTplBody(t.bodyText); setTplCta(t.callToAction || '')
    setTplRequirements(t.requirements || ''); setTplBenefits(t.benefits || '')
    setTemplateEditorOpen(true)
  }

  const saveTemplate = async () => {
    if (!tplName.trim() || !tplHeadline.trim() || !tplBody.trim()) return
    setTplSaving(true)
    const payload = {
      name: tplName.trim(),
      source: tplSource,
      headline: tplHeadline,
      bodyText: tplBody,
      requirements: tplRequirements || null,
      benefits: tplBenefits || null,
      callToAction: tplCta || null,
    }
    let saved: AdTemplateItem | null = null
    if (editingTemplate) {
      const res = await fetch(`/api/ad-templates/${editingTemplate.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) saved = await res.json()
    } else {
      const res = await fetch('/api/ad-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) saved = await res.json()
    }
    setTplSaving(false)
    if (saved) {
      await refreshTemplates()
      // Apply the saved template to the ad copy fields and select it
      setSelectedTemplateId(saved.id)
      setAdHeadline(saved.headline); setAdBody(saved.bodyText); setAdCta(saved.callToAction || '')
      if (saved.source !== 'general') setSource(saved.source)
      setTemplateEditorOpen(false)
    }
  }

  const deleteTemplate = async () => {
    if (!editingTemplate) return
    if (!confirm(`Delete template "${editingTemplate.name}"?`)) return
    setTplDeleting(true)
    const res = await fetch(`/api/ad-templates/${editingTemplate.id}`, { method: 'DELETE' })
    setTplDeleting(false)
    if (res.ok) {
      await refreshTemplates()
      if (selectedTemplateId === editingTemplate.id) {
        setSelectedTemplateId('__default__')
        loadAdCopyDefaults(source)
      }
      setTemplateEditorOpen(false)
    }
  }

  const save = async () => {
    if (!name.trim() || !flowId) return
    setSaving(true)
    const payload = { name, source, campaign, flowId, imageUrl }
    if (editingAd) {
      await fetch(`/api/ads/${editingAd.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false); setShowModal(false); refresh()
  }

  const uploadImage = async (file: File) => {
    setImageError(null)
    if (!file.type.startsWith('image/')) { setImageError('File must be an image'); return }
    if (file.size > 10 * 1024 * 1024) { setImageError('Image too large (max 10MB)'); return }
    setImageUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/pictures', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setImageError(err.error || 'Upload failed')
        return
      }
      const picture = await res.json() as Picture
      setImageUrl(picture.url)
    } finally {
      setImageUploading(false)
    }
  }

  const openLibrary = async () => {
    setShowLibrary(true)
    if (pictures.length === 0) {
      setPicturesLoading(true)
      try {
        const r = await fetch('/api/pictures')
        if (r.ok) setPictures(await r.json())
      } finally {
        setPicturesLoading(false)
      }
    }
  }

  const toggleActive = async (ad: Ad) => {
    await fetch(`/api/ads/${ad.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !ad.isActive }) })
    refresh()
  }

  const deleteAd = async (id: string) => {
    if (!confirm('Delete this ad?')) return
    await fetch(`/api/ads/${id}`, { method: 'DELETE' }); refresh()
  }

  const openDuplicate = (ad: Ad) => {
    setDuplicatingAd(ad)
    setDuplicateName(`${ad.name} (copy)`)
  }

  const confirmDuplicate = async () => {
    if (!duplicatingAd || !duplicateName.trim()) return
    setDuplicating(true)
    const res = await fetch('/api/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: duplicateName.trim(),
        source: duplicatingAd.source,
        campaign: duplicatingAd.campaign,
        flowId: duplicatingAd.flowId,
        imageUrl: duplicatingAd.imageUrl,
      }),
    })
    setDuplicating(false)
    if (res.ok) {
      setDuplicatingAd(null)
      setDuplicateName('')
      refresh()
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')

  const copyLink = (slug: string, id: string) => {
    navigator.clipboard.writeText(`${baseUrl}/a/${slug}`)
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000)
  }

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
    <div className="-mx-6 lg:-mx-[132px]">
      <PageHeader
        eyebrow={`${ads.length} ad${ads.length === 1 ? '' : 's'}`}
        title="Campaigns"
        description="Manage hiring traffic — ads, sources, and tracked links."
        actions={<Button size="sm" onClick={openCreate}>+ New ad</Button>}
      />

      <div className="px-8 py-4">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Total ads" value={ads.length} />
        <Stat label="Active" value={activeAds} delta={ads.length > 0 ? `${Math.round((activeAds / ads.length) * 100)}%` : undefined} deltaTone="success" />
        <Stat label="Total candidates" value={totalSessions} />
        <Stat label="Sources used" value={sourcesUsed} />
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
                    <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase w-[68px]"></th>
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
                        {ad.imageUrl ? (
                          <img src={ad.imageUrl} alt="" className="w-10 h-10 rounded-[6px] object-cover border border-surface-border" />
                        ) : (
                          <div className="w-10 h-10 rounded-[6px] bg-surface border border-surface-border flex items-center justify-center text-grey-50">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-medium text-grey-15">{ad.name}</div>
                        <div className="text-xs text-grey-50 mt-0.5">{new Date(ad.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 font-medium capitalize">{ad.source}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-grey-35">
                        <div className="flex items-center gap-2">
                          <span>{ad.flow.name}</span>
                          {!ad.flow.isPublished && (
                            <Link href={`/dashboard/flows/${ad.flow.id}/builder`} title="Flow is not published — link will 404" className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium hover:bg-amber-200">Unpublished</Link>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-grey-40">{ad.campaign || '—'}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-grey-15 text-right">{ad._count.sessions}</td>
                      <td className="px-5 py-4">
                        <button onClick={() => toggleActive(ad)} className={`text-xs px-2.5 py-1 rounded-full font-medium ${ad.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-grey-40'}`}>
                          {ad.isActive ? 'Active' : 'Paused'}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right space-x-3">
                        <Link href={`/dashboard/campaigns/preview/${ad.id}`} className="text-xs text-purple-500 hover:text-purple-600 font-medium">Preview</Link>
                        <button onClick={() => copyLink(ad.slug, ad.id)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">
                          {copiedId === ad.id ? 'Copied!' : 'Copy Link'}
                        </button>
                        <button onClick={() => openEdit(ad)} className="text-xs text-grey-35 hover:text-grey-15">Edit</button>
                        <button onClick={() => openDuplicate(ad)} className="text-xs text-grey-35 hover:text-grey-15">Duplicate</button>
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
                  {!ad.flow.isPublished && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700" title="Flow not published — link will 404">Flow unpublished</span>}
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-[12px] shadow-2xl p-6 w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-5">{editingAd ? 'Edit Ad' : 'New Ad'}</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Ad Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Indeed Cleaner Ad - Miami" className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Assign to Flow</label>
                  <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">Select flow...</option>
                    {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Source</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {SOURCES.map(({ value, label }) => (
                    <button key={value} onClick={() => { setSource(value); loadAdCopyDefaults(value) }} className={`py-1.5 text-xs rounded-[6px] border font-medium ${source === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35 hover:bg-surface'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-grey-50 mt-1">Changing source loads recommended ad copy for that platform</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Campaign / Group (optional)</label>
                <input type="text" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. Q1 Hiring, Miami Market" className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              {/* Picture */}
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Picture (optional)</label>
                {imageUrl ? (
                  <div className="flex items-start gap-3">
                    <img src={imageUrl} alt="Ad" className="w-24 h-24 object-cover rounded-[8px] border border-surface-border" />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-brand-500 hover:text-brand-600 font-medium cursor-pointer">
                        Replace
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
                      </label>
                      <button type="button" onClick={openLibrary} className="text-xs text-grey-35 hover:text-grey-15 text-left">Choose from library</button>
                      <button type="button" onClick={() => setImageUrl(null)} className="text-xs text-red-500 hover:text-red-600 text-left">Remove</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label className={`flex-1 border-2 border-dashed border-surface-border rounded-[8px] p-4 text-center cursor-pointer hover:bg-surface ${imageUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      <div className="text-sm text-grey-35">{imageUploading ? 'Uploading…' : 'Click to upload — PNG/JPG up to 10MB'}</div>
                      <input type="file" accept="image/*" className="hidden" disabled={imageUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
                    </label>
                    <button type="button" onClick={openLibrary} className="px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-35 hover:bg-surface">Library</button>
                  </div>
                )}
                {imageError && <p className="text-xs text-red-500 mt-1">{imageError}</p>}
              </div>

              {/* Ad Copy Section */}
              <div className="border-t border-surface-border pt-4">
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-grey-20">Ad Copy Template</label>
                    <div className="flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={openTemplateEdit}
                        disabled={selectedTemplateId === '__default__'}
                        className="text-brand-500 hover:text-brand-600 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Edit template
                      </button>
                      <button
                        type="button"
                        onClick={openTemplateNew}
                        className="text-brand-500 hover:text-brand-600 font-medium"
                      >
                        + New template
                      </button>
                    </div>
                  </div>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const val = e.target.value
                      setSelectedTemplateId(val)
                      if (val === '__default__') { loadAdCopyDefaults(source); return }
                      const t = adTemplates.find(t => t.id === val)
                      if (t) { setAdHeadline(t.headline); setAdBody(t.bodyText); setAdCta(t.callToAction || ''); if (t.source !== 'general') setSource(t.source) }
                    }}
                    className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="__default__">Default — {SOURCES.find(s => s.value === source)?.label || source} template</option>
                    {adTemplates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.source})</option>)}
                  </select>
                  <p className="text-xs text-grey-50 mt-1">{adTemplates.length === 0 ? 'No saved templates yet — click "+ New template" to save your copy for reuse.' : 'Pick a saved template or edit below.'}</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-grey-40 mb-1">Headline</label>
                    <input type="text" value={adHeadline} onChange={(e) => setAdHeadline(e.target.value)} className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-grey-40 mb-1">Body</label>
                    <textarea value={adBody} onChange={(e) => setAdBody(e.target.value)} rows={5} className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-grey-40 mb-1">Call to Action</label>
                    <input type="text" value={adCta} onChange={(e) => setAdCta(e.target.value)} className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
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

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim() || !flowId} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Saving...' : editingAd ? 'Save Changes' : 'Create Ad'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Template Editor Modal */}
      {templateEditorOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[60]" onClick={() => !tplSaving && !tplDeleting && setTemplateEditorOpen(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-6 w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-5">{editingTemplate ? 'Edit Template' : 'New Template'}</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Template name</label>
                  <input type="text" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Indeed Cleaner — Miami" className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Source</label>
                  <select value={tplSource} onChange={(e) => setTplSource(e.target.value)} className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="general">General (any source)</option>
                    {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Headline</label>
                <input type="text" value={tplHeadline} onChange={(e) => setTplHeadline(e.target.value)} className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Body</label>
                <textarea value={tplBody} onChange={(e) => setTplBody(e.target.value)} rows={5} className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Requirements (optional)</label>
                  <textarea value={tplRequirements} onChange={(e) => setTplRequirements(e.target.value)} rows={3} className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Benefits (optional)</label>
                  <textarea value={tplBenefits} onChange={(e) => setTplBenefits(e.target.value)} rows={3} className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Call to Action</label>
                <input type="text" value={tplCta} onChange={(e) => setTplCta(e.target.value)} className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              {editingTemplate ? (
                <button onClick={deleteTemplate} disabled={tplSaving || tplDeleting} className="text-sm text-red-500 hover:text-red-600 font-medium px-3 disabled:opacity-50">
                  {tplDeleting ? 'Deleting…' : 'Delete'}
                </button>
              ) : <div className="flex-1" />}
              <div className="flex-1" />
              <button onClick={() => setTemplateEditorOpen(false)} disabled={tplSaving || tplDeleting} className="btn-secondary">Cancel</button>
              <button onClick={saveTemplate} disabled={tplSaving || tplDeleting || !tplName.trim() || !tplHeadline.trim() || !tplBody.trim()} className="btn-primary disabled:opacity-50">
                {tplSaving ? 'Saving…' : editingTemplate ? 'Save changes' : 'Create template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Picture Library Modal */}
      {showLibrary && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[60]" onClick={() => setShowLibrary(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-6 w-full max-w-[680px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-grey-15">Choose a picture</h2>
              <label className="text-xs text-brand-500 hover:text-brand-600 font-medium cursor-pointer">
                + Upload new
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { await uploadImage(f); setShowLibrary(false) } e.target.value = '' }} />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto">
              {picturesLoading ? (
                <div className="text-center py-12 text-grey-40 text-sm">Loading…</div>
              ) : pictures.length === 0 ? (
                <div className="text-center py-12 text-grey-40 text-sm">No pictures yet — upload one above.</div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {pictures.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setImageUrl(p.url); setShowLibrary(false) }}
                      className={`group relative aspect-square rounded-[8px] overflow-hidden border-2 ${imageUrl === p.url ? 'border-brand-500' : 'border-surface-border hover:border-brand-300'}`}
                    >
                      <img src={p.url} alt={p.displayName || p.filename} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowLibrary(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Modal */}
      {duplicatingAd && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => !duplicating && setDuplicatingAd(null)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-6 w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-2">Duplicate Ad</h2>
            <p className="text-sm text-grey-40 mb-4">Create a copy of <span className="font-medium text-grey-20">{duplicatingAd.name}</span> with a new tracked link.</p>
            <label className="block text-sm font-medium text-grey-20 mb-1.5">New ad name</label>
            <input
              type="text"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmDuplicate() }}
              placeholder="e.g. Indeed Cleaner Ad - Miami (copy)"
              className="w-full px-3 py-2.5 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDuplicatingAd(null)} disabled={duplicating} className="btn-secondary flex-1">Cancel</button>
              <button onClick={confirmDuplicate} disabled={duplicating || !duplicateName.trim()} className="btn-primary flex-1 disabled:opacity-50">{duplicating ? 'Duplicating...' : 'Duplicate'}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
