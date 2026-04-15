'use client'

import { useState, useEffect } from 'react'
import { SubNav } from '../_components/SubNav'

const ASSETS_NAV = [
  { href: '/dashboard/content', label: 'Templates' },
  { href: '/dashboard/videos', label: 'Media' },
]

interface EmailTemplate { id: string; name: string; subject: string; bodyHtml: string; bodyText: string | null; isActive: boolean; updatedAt: string }
interface AdTemplate { id: string; name: string; source: string; headline: string; bodyText: string; requirements: string | null; benefits: string | null; callToAction: string | null; isActive: boolean; updatedAt: string }

const EMAIL_VARIABLES = ['{{candidate_name}}', '{{flow_name}}', '{{training_link}}', '{{schedule_link}}', '{{meeting_time}}', '{{meeting_link}}', '{{source}}', '{{ad_name}}']
const SOURCES = ['general', 'indeed', 'facebook', 'craigslist', 'google', 'linkedin', 'instagram', 'tiktok', 'other']

const EMAIL_DEFAULTS = [
  { name: 'Training Invitation', subject: 'Your training is ready, {{candidate_name}}!', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Great news! You\'ve passed the screening for {{flow_name}}.</p>\n<p><a href="{{training_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Start Training</a></p>', category: 'email' },
  { name: 'Scheduling Invitation', subject: 'Book your interview, {{candidate_name}}', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Congratulations on completing the training!</p>\n<p><a href="{{schedule_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Book Interview</a></p>', category: 'email' },
  { name: 'Rejection Email', subject: 'Update on your application', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Thank you for your interest in {{flow_name}}. After careful review, we\'ve decided to move forward with other candidates.</p>\n<p>We wish you the best.</p>', category: 'email' },
  { name: 'Generic Follow-up', subject: 'Following up — {{flow_name}}', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Just checking in regarding your application for {{flow_name}}.</p>\n<p>If you have any questions, feel free to reply.</p>', category: 'email' },
  { name: 'Form Submit Confirmation', subject: 'We received your application, {{candidate_name}}!', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Thank you for completing your application for {{flow_name}}. We\'ve received all your information successfully.</p>\n<p>Our team will review your submission and get back to you shortly.</p>\n<p>Best regards,<br/>The Hiring Team</p>', category: 'email' },
  { name: 'Form Submit Notification', subject: 'New application received — {{flow_name}}', bodyHtml: '<p>A new candidate has submitted their application.</p>\n<p><strong>Name:</strong> {{candidate_name}}<br/><strong>Flow:</strong> {{flow_name}}<br/><strong>Source:</strong> {{source}}</p>\n<p>Log in to your dashboard to review the submission.</p>', category: 'email' },
  { name: 'Next Step Email', subject: 'Next steps for {{flow_name}}, {{candidate_name}}', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Great progress on your application for {{flow_name}}! Here\'s what comes next:</p>\n<p>Please follow the link below to continue to the next stage of the process.</p>\n<p><a href="{{training_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Continue to Next Step</a></p>\n<p>If you have any questions, don\'t hesitate to reach out.</p>\n<p>Best,<br/>The Hiring Team</p>', category: 'email' },
  { name: 'Interview Confirmation', subject: 'Your interview is confirmed, {{candidate_name}}', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Your interview for <strong>{{flow_name}}</strong> is confirmed.</p>\n<p><strong>When:</strong> {{meeting_time}}</p>\n<p><strong>Join link:</strong> <a href="{{meeting_link}}">{{meeting_link}}</a></p>\n<p style="margin:24px 0"><a href="{{meeting_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Join Interview</a></p>\n<p>If you need to reschedule, please let us know as soon as possible.</p>\n<p>See you then,<br/>The Hiring Team</p>', category: 'email' },
  { name: 'Interview Reminder (24h)', subject: 'Reminder: Interview tomorrow — {{candidate_name}}', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Quick reminder that your interview is tomorrow.</p>\n<p><strong>When:</strong> {{meeting_time}}</p>\n<p><strong>Join link:</strong> <a href="{{meeting_link}}">{{meeting_link}}</a></p>\n<p>A few tips:</p>\n<ul>\n<li>Join from a quiet space with a good internet connection</li>\n<li>Test your camera and microphone beforehand</li>\n<li>Have any questions ready</li>\n</ul>\n<p>Looking forward to speaking with you!</p>\n<p>Best,<br/>The Hiring Team</p>', category: 'email' },
]

const AD_DEFAULTS = [
  { name: 'Indeed - General Hiring', source: 'indeed', headline: 'Now Hiring — Join Our Team!', bodyText: 'We are looking for motivated team members to join our growing company.\n\nGreat opportunity for career growth.', requirements: '- Authorized to work\n- Reliable transportation\n- Positive attitude', benefits: '- Competitive pay\n- Flexible schedule\n- Growth opportunities', callToAction: 'Apply now — takes less than 5 minutes!' },
  { name: 'Facebook - Casual Tone', source: 'facebook', headline: "We're Hiring! Come Work With Us", bodyText: "Looking for your next gig? We're hiring and we'd love to hear from you.\n\nNo long applications — just a quick intro.", requirements: null, benefits: '- Weekly pay\n- Friendly team\n- No experience needed', callToAction: 'Tap the link to apply — only takes a few minutes!' },
  { name: 'Craigslist - Simple', source: 'craigslist', headline: 'HIRING NOW — Apply Today', bodyText: 'Immediate openings. We need reliable, hardworking individuals. Full-time and part-time.', requirements: '- Must be 18+\n- Background check\n- Valid ID', benefits: '- Start ASAP\n- Paid training\n- Weekly pay', callToAction: 'Click the link to apply online.' },
  { name: 'LinkedIn - Professional', source: 'linkedin', headline: 'Join Our Growing Team', bodyText: 'We are expanding and looking for talented professionals to join us.\n\nIf you are passionate about making a difference, we want to hear from you.', requirements: '- Relevant experience preferred\n- Strong communication skills', benefits: '- Career development\n- Competitive compensation\n- Great team culture', callToAction: 'Apply through our streamlined process today.' },
]

export default function ContentPage() {
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [adTemplates, setAdTemplates] = useState<AdTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'email' | 'ad'>('all')
  const [sourceFilter, setSourceFilter] = useState('all')

  // Email modal
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [editingEmail, setEditingEmail] = useState<EmailTemplate | null>(null)
  const [emailName, setEmailName] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBodyHtml, setEmailBodyHtml] = useState('')
  const [emailBodyText, setEmailBodyText] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [previewEmail, setPreviewEmail] = useState<EmailTemplate | null>(null)

  // Ad modal
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
    Promise.all([
      fetch('/api/email-templates').then(r => r.json()),
      fetch('/api/ad-templates').then(r => r.json()).catch(() => []),
    ]).then(([e, a]) => { setEmailTemplates(e); setAdTemplates(a); setLoading(false) })
  }, [])

  const refreshEmails = async () => { const r = await fetch('/api/email-templates'); if (r.ok) setEmailTemplates(await r.json()) }
  const refreshAds = async () => { const r = await fetch('/api/ad-templates'); if (r.ok) setAdTemplates(await r.json()) }

  // Email CRUD
  const openCreateEmail = (starter?: typeof EMAIL_DEFAULTS[0]) => {
    setEditingEmail(null); setEmailName(starter?.name || ''); setEmailSubject(starter?.subject || '')
    setEmailBodyHtml(starter?.bodyHtml || '<p>Hi {{candidate_name}},</p>\n<p></p>'); setEmailBodyText(''); setShowEmailModal(true)
  }
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
  const openCreateAd = (starter?: typeof AD_DEFAULTS[0]) => {
    setEditingAd(null); setAdName(starter?.name || ''); setAdSource(starter?.source || 'general')
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

  // Filter ad templates by source
  const filteredAdTemplates = sourceFilter === 'all' ? adTemplates : adTemplates.filter(t => t.source === sourceFilter)
  const filteredAdDefaults = sourceFilter === 'all' ? AD_DEFAULTS : AD_DEFAULTS.filter(d => d.source === sourceFilter)

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <h1 className="text-[36px] font-semibold text-grey-15 mb-1">Assets</h1>
      <p className="text-grey-35 mb-6">Reusable templates and media for your flows and campaigns</p>
      <SubNav items={ASSETS_NAV} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-grey-15">Templates</h2>
          <p className="text-grey-35 text-sm mt-1">Email templates (SMS templates coming soon)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openCreateEmail()} className="btn-secondary text-sm">+ Email Template</button>
          <button onClick={() => openCreateAd()} className="btn-primary text-sm">+ Ad Template</button>
        </div>
      </div>

      {/* Type + Source filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-1 bg-surface rounded-[8px] p-1 border border-surface-border">
          {[{ v: 'all' as const, l: 'All' }, { v: 'email' as const, l: 'Emails' }, { v: 'ad' as const, l: 'Ads' }].map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)} className={`px-4 py-1.5 text-xs rounded-[6px] font-medium transition-colors ${filter === f.v ? 'bg-white text-grey-15 shadow-sm' : 'text-grey-40 hover:text-grey-20'}`}>{f.l}</button>
          ))}
        </div>
        {(filter === 'all' || filter === 'ad') && (
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="px-3 py-1.5 text-xs border border-surface-border rounded-[6px] text-grey-35">
            <option value="all">All Sources</option>
            {SOURCES.map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        )}
      </div>

      {/* DEFAULT TEMPLATES — always visible */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-grey-20 mb-3">Default Templates — click to create from these</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {(filter === 'all' || filter === 'email') && EMAIL_DEFAULTS.map((s, i) => (
            <button key={`e${i}`} onClick={() => openCreateEmail(s)} className="bg-white rounded-[8px] border border-surface-border p-4 text-left hover:shadow-md hover:border-brand-300 transition-all">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Email</span>
              </div>
              <div className="text-sm font-medium text-grey-15 mt-1">{s.name}</div>
              <div className="text-xs text-grey-40 truncate mt-0.5">{s.subject}</div>
            </button>
          ))}
          {(filter === 'all' || filter === 'ad') && filteredAdDefaults.map((s, i) => (
            <button key={`a${i}`} onClick={() => openCreateAd(s)} className="bg-white rounded-[8px] border border-surface-border p-4 text-left hover:shadow-md hover:border-brand-300 transition-all">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium capitalize">{s.source}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">Ad</span>
              </div>
              <div className="text-sm font-medium text-grey-15 mt-1">{s.name}</div>
              <div className="text-xs text-grey-40 truncate mt-0.5">{s.headline}</div>
            </button>
          ))}
        </div>
      </div>

      {/* YOUR TEMPLATES */}
      {(emailTemplates.length > 0 || adTemplates.length > 0) && (
        <>
          <h3 className="text-sm font-semibold text-grey-20 mb-3">Your Templates</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Email templates */}
            {(filter === 'all' || filter === 'email') && emailTemplates.map(t => (
              <div key={t.id} className="bg-white rounded-lg border border-surface-border p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Email</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-grey-40'}`}>{t.isActive ? 'Active' : 'Draft'}</span>
                </div>
                <h3 className="font-medium text-grey-15 mb-0.5">{t.name}</h3>
                <p className="text-xs text-grey-40 mb-3 truncate">Subject: {t.subject}</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPreviewEmail(t)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Preview</button>
                  <button onClick={() => openEditEmail(t)} className="text-xs text-grey-35 hover:text-grey-15">Edit</button>
                  <button onClick={() => deleteEmail(t.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
                </div>
              </div>
            ))}
            {/* Ad templates */}
            {(filter === 'all' || filter === 'ad') && filteredAdTemplates.map(t => (
              <div key={t.id} className="bg-white rounded-lg border border-surface-border p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium capitalize">{t.source}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">Ad</span>
                </div>
                <h3 className="font-medium text-grey-15 mb-0.5">{t.name}</h3>
                <p className="text-xs text-grey-40 mb-3 truncate">{t.headline}</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPreviewAd(t)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Preview</button>
                  <button onClick={() => copyAdText(t)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">{copiedId === t.id ? 'Copied!' : 'Copy'}</button>
                  <button onClick={() => openEditAd(t)} className="text-xs text-grey-35 hover:text-grey-15">Edit</button>
                  <button onClick={() => deleteAd(t.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Email Preview */}
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

      {/* Ad Preview */}
      {previewAd && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setPreviewAd(null)}>
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-[600px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-surface-border flex items-center justify-between">
              <div className="flex items-center gap-2"><h3 className="font-semibold text-grey-15">{previewAd.name}</h3><span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 capitalize">{previewAd.source}</span></div>
              <button onClick={() => setPreviewAd(null)} className="text-grey-40 hover:text-grey-15 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-bold text-grey-15">{previewAd.headline}</h2>
              <div className="text-sm text-grey-35 whitespace-pre-wrap">{previewAd.bodyText}</div>
              {previewAd.requirements && <div><h4 className="text-sm font-semibold text-grey-15 mb-1">Requirements</h4><div className="text-sm text-grey-35 whitespace-pre-wrap">{previewAd.requirements}</div></div>}
              {previewAd.benefits && <div><h4 className="text-sm font-semibold text-grey-15 mb-1">Benefits</h4><div className="text-sm text-grey-35 whitespace-pre-wrap">{previewAd.benefits}</div></div>}
              {previewAd.callToAction && <div className="bg-brand-50 rounded-[8px] p-4 text-sm font-medium text-brand-700">{previewAd.callToAction}</div>}
            </div>
            <div className="p-4 border-t border-surface-border flex justify-end">
              <button onClick={() => { copyAdText(previewAd); setPreviewAd(null) }} className="btn-primary text-sm">Copy Full Text</button>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
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

      {/* Ad Modal */}
      {showAdModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editingAd ? 'Edit Ad Template' : 'New Ad Template'}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Name</label><input type="text" value={adName} onChange={e => setAdName(e.target.value)} placeholder="e.g. Indeed Cleaner Ad" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
                <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Source</label><select value={adSource} onChange={e => setAdSource(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500">{SOURCES.map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
              </div>
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Headline</label><input type="text" value={adHeadline} onChange={e => setAdHeadline(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Body</label><textarea value={adBody} onChange={e => setAdBody(e.target.value)} rows={4} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Requirements</label><textarea value={adRequirements} onChange={e => setAdRequirements(e.target.value)} rows={3} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
                <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Benefits</label><textarea value={adBenefits} onChange={e => setAdBenefits(e.target.value)} rows={3} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              </div>
              <div><label className="block text-sm font-medium text-grey-20 mb-1.5">Call to Action</label><input type="text" value={adCta} onChange={e => setAdCta(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setShowAdModal(false)} className="btn-secondary flex-1">Cancel</button><button onClick={saveAd} disabled={adSaving || !adName.trim() || !adHeadline.trim() || !adBody.trim()} className="btn-primary flex-1 disabled:opacity-50">{adSaving ? 'Saving...' : editingAd ? 'Save' : 'Create'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
