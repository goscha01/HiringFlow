'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Template { id: string; name: string; body: string; isActive: boolean; updatedAt: string }

const VARIABLES = ['{{candidate_name}}', '{{flow_name}}', '{{training_link}}', '{{schedule_link}}', '{{meeting_link}}', '{{meeting_time}}', '{{source}}', '{{ad_name}}']

export default function SmsTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetch('/api/sms-templates').then(r => r.json()).then(d => { setTemplates(d); setLoading(false) }) }, [])
  const refresh = async () => { const r = await fetch('/api/sms-templates'); if (r.ok) setTemplates(await r.json()) }

  const openCreate = () => {
    setEditing(null); setName(''); setBody('Hi {{candidate_name}}, '); setShowModal(true)
  }
  const openEdit = (t: Template) => {
    setEditing(t); setName(t.name); setBody(t.body); setShowModal(true)
  }

  const save = async () => {
    if (!name.trim() || !body.trim()) return
    setSaving(true)
    const payload = { name, body }
    if (editing) {
      await fetch(`/api/sms-templates/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/sms-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false); setShowModal(false); refresh()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this template? Any rule still using it will fall back to its inline SMS body.')) return
    await fetch(`/api/sms-templates/${id}`, { method: 'DELETE' }); refresh()
  }

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  const bodyLen = body.length
  const segments = Math.max(1, Math.ceil(bodyLen / 160))

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/dashboard/automations" className="text-grey-40 hover:text-grey-15">&larr; Automations</Link>
          </div>
          <h1 className="text-[36px] font-semibold text-grey-15">SMS Templates</h1>
          <p className="text-grey-35 mt-1">Create reusable SMS bodies for automations</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ Create Template</button>
      </div>

      {templates.length === 0 ? (
        <div className="section-card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-purple-50 rounded-[8px] flex items-center justify-center">
            <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-grey-15 mb-2">No SMS templates yet</h2>
          <p className="text-grey-35 mb-6">Create your first SMS template</p>
          <button onClick={openCreate} className="btn-primary">+ Create Template</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-lg border border-surface-border p-5 hover:shadow-md transition-shadow">
              <h3 className="font-medium text-grey-15 mb-1">{t.name}</h3>
              <p className="text-sm text-grey-40 mb-3 line-clamp-2 whitespace-pre-wrap">{t.body}</p>
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editing ? 'Edit SMS Template' : 'Create SMS Template'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Template Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 1-hour Reminder" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-grey-20">SMS Body</label>
                  <span className={`text-[11px] font-mono ${bodyLen > 320 ? 'text-amber-700' : bodyLen > 160 ? 'text-grey-15' : 'text-grey-40'}`}>
                    {bodyLen} chars · {segments} seg
                  </span>
                </div>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Hi {{candidate_name}}, your interview starts at {{meeting_time}}. Join: {{meeting_link}}" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono" />
              </div>
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
              <button onClick={save} disabled={saving || !name.trim() || !body.trim()} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
