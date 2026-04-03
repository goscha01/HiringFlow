'use client'

import { useState, useEffect } from 'react'

interface Template { id: string; name: string; subject: string; bodyHtml: string; bodyText: string | null; isActive: boolean; updatedAt: string }

const VARIABLES = ['{{candidate_name}}', '{{flow_name}}', '{{training_link}}', '{{schedule_link}}', '{{source}}', '{{ad_name}}']

const CATEGORIES = [
  { value: 'all', label: 'All Templates' },
  { value: 'training', label: 'Training Invitation' },
  { value: 'scheduling', label: 'Scheduling Invitation' },
  { value: 'rejection', label: 'Rejection' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'other', label: 'Other' },
]

function guessCategory(t: Template): string {
  const text = `${t.name} ${t.subject}`.toLowerCase()
  if (text.includes('training') || text.includes('onboard')) return 'training'
  if (text.includes('schedul') || text.includes('interview') || text.includes('book')) return 'scheduling'
  if (text.includes('reject') || text.includes('unfortunately') || text.includes('not selected')) return 'rejection'
  if (text.includes('follow') || text.includes('remind') || text.includes('check in')) return 'followup'
  return 'other'
}

const STARTER_TEMPLATES = [
  { name: 'Training Invitation', subject: 'Your training is ready, {{candidate_name}}!', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Great news! You\'ve passed the screening for {{flow_name}}.</p>\n<p>Please complete your onboarding training here:</p>\n<p><a href="{{training_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Start Training</a></p>\n<p>Best,<br/>The Team</p>' },
  { name: 'Scheduling Invitation', subject: 'Book your interview, {{candidate_name}}', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Congratulations on completing the training!</p>\n<p>Please choose a time for your interview:</p>\n<p><a href="{{schedule_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Book Interview</a></p>\n<p>We look forward to speaking with you.</p>' },
  { name: 'Rejection Email', subject: 'Update on your application', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Thank you for your interest and for completing the application for {{flow_name}}.</p>\n<p>After careful review, we\'ve decided to move forward with other candidates at this time.</p>\n<p>We appreciate your time and wish you the best in your job search.</p>\n<p>Best regards,<br/>The Hiring Team</p>' },
  { name: 'Generic Follow-up', subject: 'Following up — {{flow_name}}', bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Just checking in regarding your application for {{flow_name}}.</p>\n<p>If you have any questions, feel free to reply to this email.</p>\n<p>Best,<br/>The Team</p>' },
]

export default function ContentPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [saving, setSaving] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)

  useEffect(() => { fetch('/api/email-templates').then(r => r.json()).then(d => { setTemplates(d); setLoading(false) }) }, [])
  const refresh = async () => { const r = await fetch('/api/email-templates'); if (r.ok) setTemplates(await r.json()) }

  const openCreate = () => {
    setEditing(null); setName(''); setSubject(''); setBodyHtml('<p>Hi {{candidate_name}},</p>\n<p></p>'); setBodyText(''); setShowModal(true)
  }
  const openFromStarter = (starter: typeof STARTER_TEMPLATES[0]) => {
    setEditing(null); setName(starter.name); setSubject(starter.subject); setBodyHtml(starter.bodyHtml); setBodyText(''); setShowModal(true)
  }
  const openEdit = (t: Template) => {
    setEditing(t); setName(t.name); setSubject(t.subject); setBodyHtml(t.bodyHtml); setBodyText(t.bodyText || ''); setShowModal(true)
  }

  const save = async () => {
    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) return
    setSaving(true)
    const body = { name, subject, bodyHtml, bodyText: bodyText || null }
    if (editing) {
      await fetch(`/api/email-templates/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else {
      await fetch('/api/email-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setSaving(false); setShowModal(false); refresh()
  }

  const toggleActive = async (t: Template) => {
    await fetch(`/api/email-templates/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !t.isActive }) })
    refresh()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this template?')) return
    await fetch(`/api/email-templates/${id}`, { method: 'DELETE' }); refresh()
  }

  const filtered = categoryFilter === 'all' ? templates : templates.filter(t => guessCategory(t) === categoryFilter)

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">Content</h1>
          <p className="text-grey-35 mt-1">Reusable message templates for emails and automations</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ New Template</button>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {CATEGORIES.map(c => {
          const count = c.value === 'all' ? templates.length : templates.filter(t => guessCategory(t) === c.value).length
          return (
            <button
              key={c.value}
              onClick={() => setCategoryFilter(c.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-medium whitespace-nowrap transition-colors ${
                categoryFilter === c.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-white border border-surface-border text-grey-35 hover:border-brand-300'
              }`}
            >
              {c.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${categoryFilter === c.value ? 'bg-white/20' : 'bg-surface text-grey-40'}`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Starter templates — show when no templates exist */}
      {templates.length === 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-grey-20 mb-3">Quick Start — Create from Template</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {STARTER_TEMPLATES.map((s, i) => (
              <button
                key={i}
                onClick={() => openFromStarter(s)}
                className="bg-white rounded-[8px] border border-surface-border p-4 text-left hover:shadow-md hover:border-brand-300 transition-all"
              >
                <div className="text-sm font-medium text-grey-15 mb-1">{s.name}</div>
                <div className="text-xs text-grey-40 truncate">{s.subject}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Templates grid */}
      {filtered.length === 0 && templates.length > 0 ? (
        <div className="section-card text-center py-12">
          <p className="text-grey-35">No templates in this category</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="section-card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-grey-15 mb-2">No templates yet</h2>
          <p className="text-grey-35 mb-6">Create your first email template or start from a quick template above</p>
          <button onClick={openCreate} className="btn-primary">+ New Template</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => {
            const cat = guessCategory(t)
            const catLabel = CATEGORIES.find(c => c.value === cat)?.label || 'Other'
            return (
              <div key={t.id} className="bg-white rounded-lg border border-surface-border p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-medium text-grey-15">{t.name}</h3>
                    <p className="text-xs text-grey-40 mt-0.5 truncate">Subject: {t.subject}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2 ${
                    t.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-grey-40'
                  }`}>{t.isActive ? 'Active' : 'Draft'}</span>
                </div>
                <div className="flex items-center gap-1 mb-3">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium">{catLabel}</span>
                  <span className="text-[10px] text-grey-50">Updated {new Date(t.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPreviewTemplate(t)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Preview</button>
                  <button onClick={() => openEdit(t)} className="text-xs text-grey-35 hover:text-grey-15">Edit</button>
                  <button onClick={() => toggleActive(t)} className="text-xs text-grey-35 hover:text-grey-15">{t.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button onClick={() => remove(t.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setPreviewTemplate(null)}>
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-[600px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-surface-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-grey-15">{previewTemplate.name}</h3>
                <p className="text-sm text-grey-40 mt-0.5">Subject: {previewTemplate.subject}</p>
              </div>
              <button onClick={() => setPreviewTemplate(null)} className="text-grey-40 hover:text-grey-15 text-xl">&times;</button>
            </div>
            <div className="p-6">
              <div className="bg-surface rounded-[8px] p-6 border border-surface-border" dangerouslySetInnerHTML={{ __html: previewTemplate.bodyHtml }} />
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editing ? 'Edit Template' : 'New Template'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Template Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Training Invitation" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Subject Line</label>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your training is ready, {{candidate_name}}!" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-grey-20 block mb-1.5">Email Body (HTML)</label>
                <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={10} placeholder="<p>Hi {{candidate_name}},</p>" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Plain Text Version (optional)</label>
                <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={4} placeholder="Hi {{candidate_name}}, ..." className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="bg-surface rounded-[8px] p-4">
                <label className="text-xs font-medium text-grey-40 uppercase mb-2 block">Available Variables — click to copy</label>
                <div className="flex flex-wrap gap-2">
                  {VARIABLES.map(v => (
                    <button key={v} onClick={() => navigator.clipboard.writeText(v)} className="text-xs px-2.5 py-1 bg-white border border-surface-border rounded-[8px] text-grey-15 font-mono hover:bg-brand-50 hover:border-brand-200" title="Click to copy">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim() || !subject.trim() || !bodyHtml.trim()} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
