'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Template { id: string; name: string; subject: string; bodyHtml: string; bodyText: string | null; isActive: boolean; updatedAt: string }

const VARIABLES = ['{{candidate_name}}', '{{flow_name}}', '{{training_link}}', '{{schedule_link}}', '{{source}}', '{{ad_name}}']

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetch('/api/email-templates').then(r => r.json()).then(d => { setTemplates(d); setLoading(false) }) }, [])
  const refresh = async () => { const r = await fetch('/api/email-templates'); if (r.ok) setTemplates(await r.json()) }

  const openCreate = () => {
    setEditing(null); setName(''); setSubject(''); setBodyHtml('<p>Hi {{candidate_name}},</p>\n<p>Thank you for completing the application.</p>\n<p><a href="{{training_link}}">Start your training</a></p>'); setBodyText(''); setShowModal(true)
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

  const remove = async (id: string) => {
    if (!confirm('Delete this template?')) return
    await fetch(`/api/email-templates/${id}`, { method: 'DELETE' }); refresh()
  }

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/admin/automations" className="text-grey-40 hover:text-grey-15">&larr; Automations</Link>
          </div>
          <h1 className="text-[36px] font-semibold text-grey-15">Email Templates</h1>
          <p className="text-grey-35 mt-1">Create reusable email templates for automations</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ Create Template</button>
      </div>

      {templates.length === 0 ? (
        <div className="section-card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-grey-15 mb-2">No templates yet</h2>
          <p className="text-grey-35 mb-6">Create your first email template</p>
          <button onClick={openCreate} className="btn-primary">+ Create Template</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-lg border border-surface-border p-5 hover:shadow-md transition-shadow">
              <h3 className="font-medium text-grey-15 mb-1">{t.name}</h3>
              <p className="text-sm text-grey-40 mb-3 truncate">Subject: {t.subject}</p>
              <div className="flex items-center gap-3">
                <button onClick={() => openEdit(t)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">Edit</button>
                <button onClick={() => remove(t.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editing ? 'Edit Template' : 'Create Template'}</h2>
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-grey-20">HTML Body</label>
                </div>
                <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={10} placeholder="<p>Hi {{candidate_name}},</p>" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Plain Text (optional)</label>
                <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={4} placeholder="Hi {{candidate_name}}, ..." className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              {/* Available variables */}
              <div className="bg-surface rounded-[8px] p-4">
                <label className="text-xs font-medium text-grey-40 uppercase mb-2 block">Available Variables</label>
                <div className="flex flex-wrap gap-2">
                  {VARIABLES.map(v => (
                    <button key={v} onClick={() => { navigator.clipboard.writeText(v) }} className="text-xs px-2.5 py-1 bg-white border border-surface-border rounded-[8px] text-grey-15 font-mono hover:bg-brand-50 hover:border-brand-200" title="Click to copy">
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
