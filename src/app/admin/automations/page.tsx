'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Flow { id: string; name: string }
interface Template { id: string; name: string; subject: string }
interface Rule {
  id: string; name: string; triggerType: string; flowId: string | null
  actionType: string; emailTemplateId: string; nextStepType: string | null
  nextStepUrl: string | null; isActive: boolean; createdAt: string
  flow: Flow | null; emailTemplate: Template; _count: { executions: number }
}

const TRIGGERS = [
  { value: 'flow_completed', label: 'Flow Completed' },
  { value: 'flow_passed', label: 'Flow Passed' },
]

export default function AutomationsPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('flow_completed')
  const [flowId, setFlowId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [nextStepType, setNextStepType] = useState('')
  const [nextStepUrl, setNextStepUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/automations').then(r => r.json()),
      fetch('/api/flows').then(r => r.json()),
      fetch('/api/email-templates').then(r => r.json()),
    ]).then(([r, f, t]) => { setRules(r); setFlows(f); setTemplates(t); setLoading(false) })
  }, [])

  const refresh = async () => { const r = await fetch('/api/automations'); if (r.ok) setRules(await r.json()) }

  const openCreate = () => {
    setEditing(null); setName(''); setTriggerType('flow_completed'); setFlowId(''); setTemplateId(templates[0]?.id || ''); setNextStepType(''); setNextStepUrl(''); setShowModal(true)
  }
  const openEdit = (r: Rule) => {
    setEditing(r); setName(r.name); setTriggerType(r.triggerType); setFlowId(r.flowId || ''); setTemplateId(r.emailTemplateId); setNextStepType(r.nextStepType || ''); setNextStepUrl(r.nextStepUrl || ''); setShowModal(true)
  }

  const save = async () => {
    if (!name.trim() || !templateId) return
    setSaving(true)
    const body = { name, triggerType, flowId: flowId || null, emailTemplateId: templateId, nextStepType: nextStepType || null, nextStepUrl: nextStepUrl || null }
    if (editing) {
      await fetch(`/api/automations/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else {
      await fetch('/api/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setSaving(false); setShowModal(false); refresh()
  }

  const toggle = async (r: Rule) => {
    await fetch(`/api/automations/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !r.isActive }) })
    refresh()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this automation?')) return
    await fetch(`/api/automations/${id}`, { method: 'DELETE' }); refresh()
  }

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">Automations</h1>
          <p className="text-grey-35 mt-1">Trigger emails automatically when candidates complete flows</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/automations/templates" className="btn-secondary text-sm">Email Templates</Link>
          <button onClick={openCreate} className="btn-primary">+ Create Automation</button>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="section-card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-[8px] flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-grey-15 mb-2">No automations yet</h2>
          <p className="text-grey-35 mb-4">Create email templates first, then set up automations</p>
          <div className="flex gap-3 justify-center">
            <Link href="/admin/automations/templates" className="btn-secondary">Create Template</Link>
            <button onClick={openCreate} className="btn-primary">+ Create Automation</button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-surface-border overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-surface-border bg-surface">
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Trigger</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Flow</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Template</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Next Step</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Sent</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-surface-light">
                  <td className="px-5 py-4 text-sm font-medium text-grey-15">{r.name}</td>
                  <td className="px-5 py-4"><span className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 font-medium">{r.triggerType === 'flow_passed' ? 'Flow Passed' : 'Flow Completed'}</span></td>
                  <td className="px-5 py-4 text-sm text-grey-35">{r.flow?.name || 'Any flow'}</td>
                  <td className="px-5 py-4 text-sm text-grey-35">{r.emailTemplate.name}</td>
                  <td className="px-5 py-4 text-sm text-grey-40">{r.nextStepType || '—'}</td>
                  <td className="px-5 py-4 text-sm font-medium text-grey-15">{r._count.executions}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => toggle(r)} className={`text-xs px-2.5 py-1 rounded-full font-medium ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-grey-40'}`}>
                      {r.isActive ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right space-x-3">
                    <button onClick={() => openEdit(r)} className="text-xs text-grey-35 hover:text-grey-15">Edit</button>
                    <button onClick={() => remove(r.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
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
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editing ? 'Edit Automation' : 'Create Automation'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Send training after screening" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Trigger</label>
                <div className="flex gap-2">
                  {TRIGGERS.map(t => (
                    <button key={t.value} onClick={() => setTriggerType(t.value)} className={`flex-1 py-2.5 text-xs rounded-[8px] border font-medium ${triggerType === t.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}>{t.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Flow (optional — leave empty for all flows)</label>
                <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Any flow</option>
                  {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Email Template</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Select template...</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {templates.length === 0 && <p className="text-xs text-brand-500 mt-1"><Link href="/admin/automations/templates">Create a template first →</Link></p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Next Step Type</label>
                <div className="flex gap-2">
                  {[{ v: '', l: 'None' }, { v: 'training', l: 'Training' }, { v: 'scheduling', l: 'Scheduling' }].map(({ v, l }) => (
                    <button key={v} onClick={() => setNextStepType(v)} className={`flex-1 py-2 text-xs rounded-[8px] border font-medium ${nextStepType === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}>{l}</button>
                  ))}
                </div>
              </div>
              {nextStepType && (
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Next Step URL</label>
                  <input type="url" value={nextStepUrl} onChange={(e) => setNextStepUrl(e.target.value)} placeholder="https://..." className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim() || !templateId} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
