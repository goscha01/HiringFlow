'use client'

import { useState, useEffect } from 'react'

interface EmailTemplate { id: string; name: string; subject: string; bodyHtml: string; bodyText: string | null; isActive: boolean; updatedAt: string }
interface AdTemplate { id: string; name: string; source: string; headline: string; bodyText: string; requirements: string | null; benefits: string | null; callToAction: string | null; isActive: boolean; updatedAt: string }

const EMAIL_VARIABLES = ['{{candidate_name}}', '{{flow_name}}', '{{training_link}}', '{{schedule_link}}', '{{source}}', '{{ad_name}}']

const SOURCES = ['general', 'indeed', 'facebook', 'craigslist', 'google', 'linkedin', 'instagram', 'tiktok', 'other']

const AD_STARTERS = [
  { name: 'Indeed - General Hiring', source: 'indeed', headline: 'Now Hiring — Join Our Team!', bodyText: 'We are looking for motivated team members to join our growing company.\n\nThis is a great opportunity for someone who wants to grow their career in a supportive environment.', requirements: '- Must be authorized to work in the US\n- Reliable transportation\n- Positive attitude', benefits: '- Competitive pay\n- Flexible schedule\n- Growth opportunities', callToAction: 'Apply now through our quick online process — takes less than 5 minutes!' },
  { name: 'Facebook - Casual Tone', source: 'facebook', headline: 'We\'re Hiring! Come Work With Us', bodyText: 'Looking for your next gig? We\'re hiring and we\'d love to hear from you.\n\nNo long applications. Just a quick video intro and you could be starting next week.', requirements: null, benefits: '- Weekly pay\n- Friendly team\n- No experience needed', callToAction: 'Tap the link to apply — it only takes a few minutes!' },
  { name: 'Craigslist - Simple', source: 'craigslist', headline: 'HIRING NOW — Apply Today', bodyText: 'Immediate openings available.\n\nWe are looking for reliable, hardworking individuals to join our team. Full-time and part-time positions available.', requirements: '- Must be 18+\n- Background check required\n- Valid ID', benefits: '- Start ASAP\n- Paid training\n- Weekly pay', callToAction: 'Click the link below to apply online. Quick and easy process.' },
]

export default function ContentPage() {
  const [tab, setTab] = useState<'email' | 'ads'>('email')

  // Email templates
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [emailLoading, setEmailLoading] = useState(true)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [editingEmail, setEditingEmail] = useState<EmailTemplate | null>(null)
  const [emailName, setEmailName] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBodyHtml, setEmailBodyHtml] = useState('')
  const [emailBodyText, setEmailBodyText] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [previewEmail, setPreviewEmail] = useState<EmailTemplate | null>(null)

  // Ad templates
  const [adTemplates, setAdTemplates] = useState<AdTemplate[]>([])
  const [adLoading, setAdLoading] = useState(true)
  const [showAdModal, setShowAdModal] = useState(false)
  const [editingAd, setEditingAd] = useState<AdTemplate | null>(null)
  const [adName, setAdName] = useState('')
  const [adSource, setAdSource] = useState('general')
  const [adHeadline, setAdHeadline] = useState('')
  const [adBody, setAdBody] = useState('')
  const [adRequirements, setAdRequirements] = useState('')
  const [adBenefits, setAdBenefits] = useState('')
  const [adCta, setAdCta] = useState('')
  const [adSaving, setAdSaving] = useState(false)
  const [previewAd, setPreviewAd] = useState<AdTemplate | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/email-templates').then(r => r.json()).then(d => { setEmailTemplates(d); setEmailLoading(false) })
    fetch('/api/ad-templates').then(r => r.json()).then(d => { setAdTemplates(d); setAdLoading(false) })
  }, [])

  const refreshEmails = async () => { const r = await fetch('/api/email-templates'); if (r.ok) setEmailTemplates(await r.json()) }
  const refreshAds = async () => { const r = await fetch('/api/ad-templates'); if (r.ok) setAdTemplates(await r.json()) }

  // Email CRUD
  const openCreateEmail = () => { setEditingEmail(null); setEmailName(''); setEmailSubject(''); setEmailBodyHtml('<p>Hi {{candidate_name}},</p>\n<p></p>'); setEmailBodyText(''); setShowEmailModal(true) }
  const openEditEmail = (t: EmailTemplate) => { setEditingEmail(t); setEmailName(t.name); setEmailSubject(t.subject); setEmailBodyHtml(t.bodyHtml); setEmailBodyText(t.bodyText || ''); setShowEmailModal(true) }
  const saveEmail = async () => {
    if (!emailName.trim() || !emailSubject.trim() || !emailBodyHtml.trim()) return
    setEmailSaving(true)
    const body = { name: emailName, subject: emailSubject, bodyHtml: emailBodyHtml, bodyText: emailBodyText || null }
    if (editingEmail) { await fetch(`/api/email-templates/${editingEmail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    else { await fetch('/api/email-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    setEmailSaving(false); setShowEmailModal(false); refreshEmails()
  }
  const deleteEmail = async (id: string) => { if (!confirm('Delete?')) return; await fetch(`/api/email-templates/${id}`, { method: 'DELETE' }); refreshEmails() }

  // Ad CRUD
  const openCreateAd = (starter?: typeof AD_STARTERS[0]) => {
    setEditingAd(null)
    setAdName(starter?.name || ''); setAdSource(starter?.source || 'general')
    setAdHeadline(starter?.headline || ''); setAdBody(starter?.bodyText || '')
    setAdRequirements(starter?.requirements || ''); setAdBenefits(starter?.benefits || '')
    setAdCta(starter?.callToAction || ''); setShowAdModal(true)
  }
  const openEditAd = (t: AdTemplate) => {
    setEditingAd(t); setAdName(t.name); setAdSource(t.source); setAdHeadline(t.headline)
    setAdBody(t.bodyText); setAdRequirements(t.requirements || ''); setAdBenefits(t.benefits || '')
    setAdCta(t.callToAction || ''); setShowAdModal(true)
  }
  const saveAd = async () => {
    if (!adName.trim() || !adHeadline.trim() || !adBody.trim()) return
    setAdSaving(true)
    const body = { name: adName, source: adSource, headline: adHeadline, bodyText: adBody, requirements: adRequirements || null, benefits: adBenefits || null, callToAction: adCta || null }
    if (editingAd) { await fetch(`/api/ad-templates/${editingAd.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    else { await fetch('/api/ad-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    setAdSaving(false); setShowAdModal(false); refreshAds()
  }
  const deleteAd = async (id: string) => { if (!confirm('Delete?')) return; await fetch(`/api/ad-templates/${id}`, { method: 'DELETE' }); refreshAds() }

  const copyAdText = (t: AdTemplate) => {
    const text = [t.headline, '', t.bodyText, t.requirements ? '\nRequirements:\n' + t.requirements : '', t.benefits ? '\nBenefits:\n' + t.benefits : '', t.callToAction ? '\n' + t.callToAction : ''].filter(Boolean).join('\n')
    navigator.clipboard.writeText(text); setCopiedId(t.id); setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">Content</h1>
          <p className="text-grey-35 mt-1">Reusable templates for emails and ad copy</p>
        </div>
        <button onClick={() => tab === 'email' ? openCreateEmail() : openCreateAd()} className="btn-primary">
          + New {tab === 'email' ? 'Email' : 'Ad'} Template
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-surface-border">
        <button onClick={() => setTab('email')} className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'email' ? 'border-brand-500 text-brand-600' : 'border-transparent text-grey-40 hover:text-grey-20'}`}>
          Email Templates ({emailTemplates.length})
        </button>
        <button onClick={() => setTab('ads')} className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'ads' ? 'border-brand-500 text-brand-600' : 'border-transparent text-grey-40 hover:text-grey-20'}`}>
          Ad Templates ({adTemplates.length})
        </button>
      </div>

      {/* EMAIL TEMPLATES TAB */}
      {tab === 'email' && (
        <>
          {emailLoading ? <div className="text-center py-12 text-grey-40">Loading...</div> :
          emailTemplates.length === 0 ? (
            <div className="section-card text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
                <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <h2 className="text-xl font-semibold text-grey-15 mb-2">No email templates yet</h2>
              <p className="text-grey-35 mb-6">Create templates for automations</p>
              <button onClick={openCreateEmail} className="btn-primary">+ New Email Template</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {emailTemplates.map(t => (
                <div key={t.id} className="bg-white rounded-lg border border-surface-border p-5 hover:shadow-md transition-shadow">
                  <h3 className="font-medium text-grey-15 mb-1">{t.name}</h3>
                  <p className="text-xs text-grey-40 mb-3 truncate">Subject: {t.subject}</p>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setPreviewEmail(t)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Preview</button>
                    <button onClick={() => openEditEmail(t)} className="text-xs text-grey-35 hover:text-grey-15">Edit</button>
                    <button onClick={() => deleteEmail(t.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* AD TEMPLATES TAB */}
      {tab === 'ads' && (
        <>
          {/* Starter templates */}
          {adTemplates.length === 0 && !adLoading && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-grey-20 mb-3">Quick Start — Create from Template</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {AD_STARTERS.map((s, i) => (
                  <button key={i} onClick={() => openCreateAd(s)} className="bg-white rounded-[8px] border border-surface-border p-4 text-left hover:shadow-md hover:border-brand-300 transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-grey-15">{s.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 capitalize">{s.source}</span>
                    </div>
                    <div className="text-xs text-grey-40 truncate">{s.headline}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {adLoading ? <div className="text-center py-12 text-grey-40">Loading...</div> :
          adTemplates.length === 0 ? (
            <div className="section-card text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
                <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </div>
              <h2 className="text-xl font-semibold text-grey-15 mb-2">No ad templates yet</h2>
              <p className="text-grey-35 mb-6">Create reusable ad copy for your job postings</p>
              <button onClick={() => openCreateAd()} className="btn-primary">+ New Ad Template</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {adTemplates.map(t => (
                <div key={t.id} className="bg-white rounded-lg border border-surface-border p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-grey-15">{t.name}</h3>
                      <p className="text-sm text-grey-35 mt-0.5">{t.headline}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium capitalize flex-shrink-0 ml-2">{t.source}</span>
                  </div>
                  <p className="text-xs text-grey-40 line-clamp-2 mb-3">{t.bodyText}</p>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setPreviewAd(t)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Preview</button>
                    <button onClick={() => copyAdText(t)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">{copiedId === t.id ? 'Copied!' : 'Copy Text'}</button>
                    <button onClick={() => openEditAd(t)} className="text-xs text-grey-35 hover:text-grey-15">Edit</button>
                    <button onClick={() => deleteAd(t.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Email Preview Modal */}
      {previewEmail && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setPreviewEmail(null)}>
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-[600px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-surface-border flex items-center justify-between">
              <div><h3 className="font-semibold text-grey-15">{previewEmail.name}</h3><p className="text-sm text-grey-40 mt-0.5">Subject: {previewEmail.subject}</p></div>
              <button onClick={() => setPreviewEmail(null)} className="text-grey-40 hover:text-grey-15 text-xl">&times;</button>
            </div>
            <div className="p-6"><div className="bg-surface rounded-[8px] p-6 border border-surface-border" dangerouslySetInnerHTML={{ __html: previewEmail.bodyHtml }} /></div>
          </div>
        </div>
      )}

      {/* Ad Preview Modal */}
      {previewAd && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setPreviewAd(null)}>
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-[600px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-surface-border flex items-center justify-between">
              <div className="flex items-center gap-2"><h3 className="font-semibold text-grey-15">{previewAd.name}</h3><span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 capitalize">{previewAd.source}</span></div>
              <button onClick={() => setPreviewAd(null)} className="text-grey-40 hover:text-grey-15 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div><h2 className="text-xl font-bold text-grey-15">{previewAd.headline}</h2></div>
              <div className="text-sm text-grey-35 whitespace-pre-wrap">{previewAd.bodyText}</div>
              {previewAd.requirements && <div><h4 className="text-sm font-semibold text-grey-15 mb-1">Requirements</h4><div className="text-sm text-grey-35 whitespace-pre-wrap">{previewAd.requirements}</div></div>}
              {previewAd.benefits && <div><h4 className="text-sm font-semibold text-grey-15 mb-1">Benefits</h4><div className="text-sm text-grey-35 whitespace-pre-wrap">{previewAd.benefits}</div></div>}
              {previewAd.callToAction && <div className="bg-brand-50 rounded-[8px] p-4 text-sm font-medium text-brand-700">{previewAd.callToAction}</div>}
            </div>
            <div className="p-4 border-t border-surface-border flex justify-end">
              <button onClick={() => { copyAdText(previewAd); setPreviewAd(null) }} className="btn-primary text-sm">{copiedId === previewAd.id ? 'Copied!' : 'Copy Full Text'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Email Create/Edit Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setShowEmailModal(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editingEmail ? 'Edit Email Template' : 'New Email Template'}</h2>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Name</label><input type="text" value={emailName} onChange={e => setEmailName(e.target.value)} placeholder="e.g. Training Invitation" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Subject</label><input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="e.g. Your training is ready!" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              <div><label className="text-sm font-medium text-grey-20 block mb-1.5">Body (HTML)</label><textarea value={emailBodyHtml} onChange={e => setEmailBodyHtml(e.target.value)} rows={8} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Plain Text (optional)</label><textarea value={emailBodyText} onChange={e => setEmailBodyText(e.target.value)} rows={3} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              <div className="bg-surface rounded-[8px] p-3"><label className="text-xs font-medium text-grey-40 uppercase mb-2 block">Variables — click to copy</label><div className="flex flex-wrap gap-2">{EMAIL_VARIABLES.map(v => <button key={v} onClick={() => navigator.clipboard.writeText(v)} className="text-xs px-2.5 py-1 bg-white border border-surface-border rounded-[8px] text-grey-15 font-mono hover:bg-brand-50">{v}</button>)}</div></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setShowEmailModal(false)} className="btn-secondary flex-1">Cancel</button><button onClick={saveEmail} disabled={emailSaving || !emailName.trim() || !emailSubject.trim() || !emailBodyHtml.trim()} className="btn-primary flex-1 disabled:opacity-50">{emailSaving ? 'Saving...' : editingEmail ? 'Save' : 'Create'}</button></div>
          </div>
        </div>
      )}

      {/* Ad Create/Edit Modal */}
      {showAdModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setShowAdModal(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editingAd ? 'Edit Ad Template' : 'New Ad Template'}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Template Name</label><input type="text" value={adName} onChange={e => setAdName(e.target.value)} placeholder="e.g. Indeed Cleaner Ad" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
                <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Source / Platform</label><select value={adSource} onChange={e => setAdSource(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"><option value="general">General</option>{SOURCES.filter(s => s !== 'general').map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
              </div>
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Headline</label><input type="text" value={adHeadline} onChange={e => setAdHeadline(e.target.value)} placeholder="e.g. Now Hiring — Join Our Team!" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Body Text</label><textarea value={adBody} onChange={e => setAdBody(e.target.value)} rows={5} placeholder="Main ad copy..." className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Requirements (optional)</label><textarea value={adRequirements} onChange={e => setAdRequirements(e.target.value)} rows={3} placeholder="- Must be 18+&#10;- Valid ID" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Benefits (optional)</label><textarea value={adBenefits} onChange={e => setAdBenefits(e.target.value)} rows={3} placeholder="- Competitive pay&#10;- Flexible schedule" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Call to Action (optional)</label><input type="text" value={adCta} onChange={e => setAdCta(e.target.value)} placeholder="Apply now — takes less than 5 minutes!" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setShowAdModal(false)} className="btn-secondary flex-1">Cancel</button><button onClick={saveAd} disabled={adSaving || !adName.trim() || !adHeadline.trim() || !adBody.trim()} className="btn-primary flex-1 disabled:opacity-50">{adSaving ? 'Saving...' : editingAd ? 'Save' : 'Create'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
