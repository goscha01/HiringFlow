'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Flow { id: string; name: string }
interface Template { id: string; name: string; subject: string }
interface TrainingItem { id: string; title: string; slug: string }
interface SchedulingItem { id: string; name: string; schedulingUrl: string }
interface Rule {
  id: string; name: string; triggerType: string; flowId: string | null
  actionType: string; emailTemplateId: string; nextStepType: string | null
  nextStepUrl: string | null; trainingId: string | null; schedulingConfigId: string | null
  isActive: boolean; createdAt: string
  flow: Flow | null; emailTemplate: Template; training: TrainingItem | null
  schedulingConfig: SchedulingItem | null; _count: { executions: number }
}

const TRIGGERS = [
  { value: 'flow_completed', label: 'Flow Completed' },
  { value: 'flow_passed', label: 'Flow Passed' },
  { value: 'training_completed', label: 'Training Done' },
  { value: 'meeting_scheduled', label: 'Meeting Scheduled' },
  { value: 'automation_completed', label: 'After Automation' },
]

const TRIGGER_LABELS: Record<string, string> = {
  flow_completed: 'Flow Completed',
  flow_passed: 'Flow Passed',
  training_completed: 'Training Done',
  meeting_scheduled: 'Meeting Scheduled',
  automation_completed: 'After Automation',
}

export default function AutomationsPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [trainings, setTrainings] = useState<TrainingItem[]>([])
  const [schedulingConfigs, setSchedulingConfigs] = useState<SchedulingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('flow_completed')
  const [flowId, setFlowId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [nextStepType, setNextStepType] = useState('')
  const [nextStepUrl, setNextStepUrl] = useState('')
  const [trainingId, setTrainingId] = useState('')
  const [schedulingConfigId, setSchedulingConfigId] = useState('')
  const [delayMinutes, setDelayMinutes] = useState(0)
  const [emailDestination, setEmailDestination] = useState<'applicant' | 'company' | 'specific'>('applicant')
  const [emailDestinationAddress, setEmailDestinationAddress] = useState('')
  const [companyEmail, setCompanyEmail] = useState<string | null>(null)
  const [showCompanyEmailWarning, setShowCompanyEmailWarning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  // Inline template creator
  const [showNewTemplate, setShowNewTemplate] = useState(false)
  const [newTplName, setNewTplName] = useState('')
  const [newTplSubject, setNewTplSubject] = useState('')
  const [newTplBody, setNewTplBody] = useState('<p>Hi {{candidate_name}},</p>\n<p></p>')
  const [savingTpl, setSavingTpl] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/automations').then(r => r.json()),
      fetch('/api/flows').then(r => r.json()),
      fetch('/api/email-templates').then(r => r.json()),
      fetch('/api/trainings').then(r => r.json()),
      fetch('/api/scheduling').then(r => r.json()),
      fetch('/api/workspace/settings').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([r, f, t, tr, sc, ws]) => {
      setRules(r); setFlows(f); setTemplates(t); setTrainings(tr); setSchedulingConfigs(sc)
      setCompanyEmail(ws?.senderEmail || null)
      setLoading(false)
    })
  }, [])

  const refresh = async () => { const r = await fetch('/api/automations'); if (r.ok) setRules(await r.json()) }

  const openCreate = () => {
    setEditing(null); setName(''); setTriggerType('flow_completed'); setFlowId('')
    setTemplateId(templates[0]?.id || ''); setNextStepType(''); setNextStepUrl('')
    setTrainingId(''); setSchedulingConfigId(''); setDelayMinutes(0)
    setEmailDestination('applicant'); setEmailDestinationAddress('')
    setShowModal(true)
  }
  const openEdit = (r: Rule) => {
    setEditing(r); setName(r.name); setTriggerType(r.triggerType); setFlowId(r.flowId || (r as any).triggerAutomationId || '')
    setTemplateId(r.emailTemplateId); setNextStepType(r.nextStepType || ''); setNextStepUrl(r.nextStepUrl || '')
    setTrainingId(r.trainingId || ''); setSchedulingConfigId(r.schedulingConfigId || '')
    setDelayMinutes((r as any).delayMinutes || 0)
    setEmailDestination(((r as any).emailDestination as 'applicant' | 'company' | 'specific') || 'applicant')
    setEmailDestinationAddress((r as any).emailDestinationAddress || '')
    setShowModal(true)
  }

  const save = async () => {
    if (!name.trim() || !templateId) return
    setSaving(true)
    const body = {
      name, triggerType,
      flowId: (triggerType !== 'training_completed' && triggerType !== 'automation_completed') ? (flowId || null) : null,
      triggerAutomationId: triggerType === 'automation_completed' ? (flowId || null) : null,
      emailTemplateId: templateId,
      nextStepType: nextStepType || null,
      nextStepUrl: null as string | null,
      trainingId: nextStepType === 'training' ? (trainingId || null) : null,
      schedulingConfigId: nextStepType === 'scheduling' ? (schedulingConfigId || null) : null,
      delayMinutes,
      emailDestination,
      emailDestinationAddress: emailDestination === 'specific' ? (emailDestinationAddress || null) : null,
    }
    if (editing) {
      await fetch(`/api/automations/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else {
      await fetch('/api/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setSaving(false); setShowModal(false); refresh()
  }

  const createTemplate = async () => {
    if (!newTplName.trim() || !newTplSubject.trim() || !newTplBody.trim()) return
    setSavingTpl(true)
    const r = await fetch('/api/email-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTplName, subject: newTplSubject, bodyHtml: newTplBody }),
    })
    if (r.ok) {
      const newTpl = await r.json()
      // Refresh templates list and pre-select the new one
      const tplRes = await fetch('/api/email-templates')
      if (tplRes.ok) setTemplates(await tplRes.json())
      setTemplateId(newTpl.id)
      setShowNewTemplate(false)
      setNewTplName(''); setNewTplSubject(''); setNewTplBody('<p>Hi {{candidate_name}},</p>\n<p></p>')
    }
    setSavingTpl(false)
  }

  const toggle = async (r: Rule) => {
    await fetch(`/api/automations/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !r.isActive }) })
    refresh()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this automation?')) return
    await fetch(`/api/automations/${id}`, { method: 'DELETE' }); refresh()
  }

  const duplicate = async (r: Rule) => {
    const res = await fetch(`/api/automations/${r.id}/duplicate`, { method: 'POST' })
    if (res.ok) refresh()
    else alert('Failed to duplicate automation')
  }

  const runTest = async (r: Rule) => {
    const to = prompt(`Send a test email for "${r.name}" to:`, '')
    if (!to || !to.includes('@')) return
    setTestingId(r.id)
    try {
      const res = await fetch(`/api/automations/${r.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        alert(`Test email sent to ${data.sentTo}.\nCheck inbox (and spam folder). No execution record was created.`)
      } else {
        alert(`Test failed: ${data.error || 'Unknown error'}`)
      }
    } finally {
      setTestingId(null)
    }
  }

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[36px] font-semibold text-grey-15">Automations</h1>
          <p className="text-grey-35 mt-1">Trigger emails when candidates complete flows or training</p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/content" className="btn-secondary text-sm">Email Templates</Link>
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
            <Link href="/dashboard/content" className="btn-secondary">Create Template</Link>
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
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Delay</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Sent</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-surface-light">
                  <td className="px-5 py-4 text-sm font-medium text-grey-15">{r.name}</td>
                  <td className="px-5 py-4"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${r.triggerType === 'training_completed' ? 'bg-green-50 text-green-700' : 'bg-brand-50 text-brand-600'}`}>{TRIGGER_LABELS[r.triggerType] || r.triggerType}</span></td>
                  <td className="px-5 py-4 text-sm text-grey-35">{r.flow?.name || 'Any flow'}</td>
                  <td className="px-5 py-4 text-sm text-grey-35">{r.emailTemplate.name}</td>
                  <td className="px-5 py-4 text-sm text-grey-40">
                    {r.nextStepType === 'training' && r.training ? (
                      <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 font-medium">{r.training.title}</span>
                    ) : r.nextStepType === 'scheduling' && r.schedulingConfig ? (
                      <span className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 font-medium">{r.schedulingConfig.name}</span>
                    ) : r.nextStepType || '—'}
                  </td>
                  <td className="px-5 py-4 text-xs text-grey-40">
                    {(r as any).delayMinutes > 0 ? (
                      (r as any).delayMinutes >= 1440 ? `${Math.round((r as any).delayMinutes / 1440)}d` :
                      (r as any).delayMinutes >= 60 ? `${Math.round((r as any).delayMinutes / 60)}h` :
                      `${(r as any).delayMinutes}m`
                    ) : 'Instant'}
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-grey-15">{r._count.executions}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => toggle(r)} className={`text-xs px-2.5 py-1 rounded-full font-medium ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-grey-40'}`}>
                      {r.isActive ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right space-x-3">
                    <button onClick={() => runTest(r)} disabled={testingId === r.id} className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50">
                      {testingId === r.id ? 'Sending…' : 'Test'}
                    </button>
                    <button onClick={() => duplicate(r)} className="text-xs text-grey-35 hover:text-grey-15">Duplicate</button>
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[520px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-6">{editing ? 'Edit Automation' : 'Create Automation'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Send scheduling after training" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Trigger</label>
                <div className="flex gap-2">
                  {TRIGGERS.map(t => (
                    <button key={t.value} onClick={() => setTriggerType(t.value)} className={`flex-1 py-2.5 text-xs rounded-[8px] border font-medium ${triggerType === t.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}>{t.label}</button>
                  ))}
                </div>
              </div>
              {triggerType !== 'training_completed' && triggerType !== 'automation_completed' && (
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Flow (optional — leave empty for all flows)</label>
                  <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">Any flow</option>
                    {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              {triggerType === 'automation_completed' && (
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">After which automation?</label>
                  <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">Select automation...</option>
                    {rules.filter(r => !editing || r.id !== editing.id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <p className="text-xs text-grey-40 mt-1">This automation will fire after the selected automation completes.</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Next Step Type</label>
                <div className="flex gap-2">
                  {[{ v: '', l: 'None' }, { v: 'email', l: 'Send Email' }, { v: 'training', l: 'Training' }, { v: 'scheduling', l: 'Scheduling' }].map(({ v, l }) => (
                    <button key={v} onClick={() => setNextStepType(v)} className={`flex-1 py-2 text-xs rounded-[8px] border font-medium ${nextStepType === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}>{l}</button>
                  ))}
                </div>
              </div>
              {nextStepType && (
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Email Template</label>
                  {!showNewTemplate ? (
                    <>
                      {/* Template picker — saved templates */}
                      {templates.length > 0 && (
                        <select value={templateId} onChange={(e) => {
                          setTemplateId(e.target.value)
                          const t = templates.find(t => t.id === e.target.value)
                          if (t) { setNewTplName(t.name); setNewTplSubject(t.subject); setNewTplBody((t as any).bodyHtml || '') }
                        }} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500 mb-2">
                          <option value="">Select saved template...</option>
                          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      )}
                      {/* Default templates as clickable cards */}
                      <p className="text-xs text-grey-40 mb-2">{templates.length > 0 ? 'Or start from a default:' : 'Choose a default template:'}</p>
                      <div className="grid grid-cols-2 gap-1.5 mb-2">
                        {[
                          { name: 'Form Confirmation', subject: 'We received your application, {{candidate_name}}!', body: '<p>Hi {{candidate_name}},</p>\n<p>Thank you for completing your application for {{flow_name}}. We\'ll review and get back to you shortly.</p>\n<p>Best regards,<br/>The Hiring Team</p>' },
                          { name: 'Training Invitation', subject: 'Your training is ready, {{candidate_name}}!', body: '<p>Hi {{candidate_name}},</p>\n<p>You\'ve passed the screening for {{flow_name}}.</p>\n<p><a href="{{training_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Start Training</a></p>' },
                          { name: 'Scheduling Invite', subject: 'Book your interview, {{candidate_name}}', body: '<p>Hi {{candidate_name}},</p>\n<p>Please choose a time for your interview:</p>\n<p><a href="{{schedule_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Book Interview</a></p>' },
                          { name: 'Next Step', subject: 'Next steps — {{flow_name}}', body: '<p>Hi {{candidate_name}},</p>\n<p>Here\'s what comes next for {{flow_name}}.</p>\n<p><a href="{{training_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Continue</a></p>' },
                          { name: 'Rejection', subject: 'Update on your application', body: '<p>Hi {{candidate_name}},</p>\n<p>Thank you for your interest in {{flow_name}}. After careful review, we\'ve decided to move forward with other candidates.</p>\n<p>We wish you the best.</p>' },
                          { name: 'Follow-up', subject: 'Following up — {{flow_name}}', body: '<p>Hi {{candidate_name}},</p>\n<p>Just checking in regarding your application for {{flow_name}}.</p>\n<p>If you have any questions, feel free to reply.</p>' },
                        ].map((tpl, i) => (
                          <button key={i} onClick={() => { setNewTplName(tpl.name); setNewTplSubject(tpl.subject); setNewTplBody(tpl.body); setShowNewTemplate(true); setTemplateId('') }} className="px-3 py-2 text-xs text-left border border-surface-border rounded-[6px] text-grey-35 hover:border-brand-400 hover:bg-brand-50 transition-colors">
                            <span className="font-medium text-grey-15 block">{tpl.name}</span>
                            <span className="text-[10px] text-grey-50 truncate block">{tpl.subject}</span>
                          </button>
                        ))}
                      </div>
                      <button onClick={() => { setNewTplName(''); setNewTplSubject(''); setNewTplBody('<p>Hi {{candidate_name}},</p>\n<p></p>'); setShowNewTemplate(true) }} className="text-xs text-brand-500 hover:text-brand-600 font-medium">+ Start from scratch</button>
                    </>
                  ) : (
                    /* Inline template editor */
                    <div className="p-4 bg-surface rounded-[8px] border border-surface-border space-y-3">
                      <div className="flex items-center justify-between">
                        <button onClick={() => setShowNewTemplate(false)} className="text-xs text-grey-40 hover:text-grey-15 flex items-center gap-1">&larr; Back to templates</button>
                      </div>
                      <div>
                        <label className="block text-xs text-grey-40 mb-1">Template Name</label>
                        <input type="text" value={newTplName} onChange={e => setNewTplName(e.target.value)} placeholder="e.g. Training Invitation" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm text-grey-15 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-grey-40 mb-1">Subject</label>
                        <input type="text" value={newTplSubject} onChange={e => setNewTplSubject(e.target.value)} placeholder="e.g. Next step: {{flow_name}}" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm text-grey-15 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-grey-40 mb-1">Body (HTML)</label>
                        <textarea value={newTplBody} onChange={e => setNewTplBody(e.target.value)} rows={5} className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm text-grey-15 font-mono focus:outline-none focus:ring-1 focus:ring-brand-500" />
                      </div>
                      <div className="bg-white rounded-[6px] p-2">
                        <label className="text-[10px] font-medium text-grey-40 uppercase block mb-1">Variables</label>
                        <div className="flex flex-wrap gap-1">{['{{candidate_name}}', '{{flow_name}}', '{{training_link}}', '{{schedule_link}}', '{{source}}', '{{ad_name}}'].map(v => <button key={v} onClick={() => navigator.clipboard.writeText(v)} className="text-[10px] px-2 py-0.5 bg-surface border border-surface-border rounded text-grey-15 font-mono hover:bg-brand-50">{v}</button>)}</div>
                      </div>
                      <button onClick={createTemplate} disabled={savingTpl || !newTplName.trim() || !newTplSubject.trim()} className="w-full py-2.5 text-xs bg-brand-500 text-white rounded-[6px] hover:bg-brand-600 disabled:opacity-50 font-medium">{savingTpl ? 'Saving...' : 'Save Template & Use'}</button>
                    </div>
                  )}
                </div>
              )}
              {nextStepType === 'training' && (
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Training</label>
                  <select value={trainingId} onChange={(e) => setTrainingId(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">Select training...</option>
                    {trainings.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  {trainings.length === 0 && <p className="text-xs text-brand-500 mt-1"><Link href="/dashboard/trainings">Create a training first →</Link></p>}
                  <p className="text-xs text-grey-40 mt-1">A unique access token will be generated for each candidate automatically.</p>
                </div>
              )}
              {nextStepType === 'scheduling' && (
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Scheduling Link</label>
                  <select value={schedulingConfigId} onChange={(e) => setSchedulingConfigId(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">Use default link</option>
                    {schedulingConfigs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {schedulingConfigs.length === 0 && <p className="text-xs text-brand-500 mt-1"><Link href="/dashboard/scheduling">Add a Calendly link first →</Link></p>}
                  <p className="text-xs text-grey-40 mt-1">Link clicks are tracked. Candidate status updates to &quot;invited to schedule&quot;.</p>
                </div>
              )}
              {/* Delay — only show when a next step is selected */}
              {nextStepType && (
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Delay</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 0, label: 'Immediately' },
                    { value: 15, label: '15 min' },
                    { value: 60, label: '1 hour' },
                    { value: 360, label: '6 hours' },
                    { value: 1440, label: '1 day' },
                    { value: 4320, label: '3 days' },
                    { value: 10080, label: '7 days' },
                  ].map(d => (
                    <button key={d.value} onClick={() => setDelayMinutes(d.value)} className={`px-3 py-1.5 text-xs rounded-[6px] border font-medium ${delayMinutes === d.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35 hover:bg-surface'}`}>
                      {d.label}
                    </button>
                  ))}
                  <button onClick={() => setDelayMinutes(delayMinutes > 0 && ![0,15,60,360,1440,4320,10080].includes(delayMinutes) ? delayMinutes : -1)} className={`px-3 py-1.5 text-xs rounded-[6px] border font-medium ${![0,15,60,360,1440,4320,10080].includes(delayMinutes) && delayMinutes !== 0 ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35 hover:bg-surface'}`}>
                    Custom
                  </button>
                </div>
                {/* Custom delay input */}
                {![0,15,60,360,1440,4320,10080].includes(delayMinutes) && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="number"
                      min={1}
                      value={delayMinutes > 0 ? delayMinutes : ''}
                      onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 0)}
                      placeholder="Enter minutes"
                      className="w-24 px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <span className="text-xs text-grey-40">minutes</span>
                    <div className="flex gap-1 ml-2">
                      {[
                        { m: 30, l: '30m' },
                        { m: 120, l: '2h' },
                        { m: 720, l: '12h' },
                        { m: 2880, l: '2d' },
                        { m: 7200, l: '5d' },
                        { m: 20160, l: '14d' },
                      ].map(q => (
                        <button key={q.m} onClick={() => setDelayMinutes(q.m)} className="text-[10px] px-2 py-1 rounded border border-surface-border text-grey-40 hover:bg-surface">{q.l}</button>
                      ))}
                    </div>
                  </div>
                )}
                {delayMinutes > 0 && <p className="text-xs text-grey-50 mt-1">Email will be sent {delayMinutes >= 1440 ? `${Math.round(delayMinutes / 1440)} day${delayMinutes >= 2880 ? 's' : ''}` : delayMinutes >= 60 ? `${Math.round(delayMinutes / 60)} hour${delayMinutes >= 120 ? 's' : ''}` : `${delayMinutes} minutes`} after trigger.</p>}
              </div>
              )}
              {nextStepType && (
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Email Destination</label>
                  <div className="flex gap-2">
                    {[
                      { v: 'applicant', l: 'Applicant' },
                      { v: 'company', l: 'Company' },
                      { v: 'specific', l: 'Specific email' },
                    ].map(({ v, l }) => (
                      <button key={v} onClick={() => {
                        if (v === 'company' && !companyEmail) { setShowCompanyEmailWarning(true); return }
                        setEmailDestination(v as 'applicant' | 'company' | 'specific')
                      }} className={`flex-1 py-2 text-xs rounded-[8px] border font-medium ${emailDestination === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}>{l}</button>
                    ))}
                  </div>
                  {emailDestination === 'specific' && (
                    <input
                      type="email"
                      value={emailDestinationAddress}
                      onChange={(e) => setEmailDestinationAddress(e.target.value)}
                      placeholder="recipient@example.com"
                      className="mt-2 w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  )}
                  {emailDestination === 'company' && companyEmail && (
                    <p className="text-xs text-grey-40 mt-1">Will send to <span className="font-medium text-grey-20">{companyEmail}</span> (set in <Link href="/dashboard/settings?tab=email" className="text-brand-500 hover:text-brand-600">Settings</Link>).</p>
                  )}
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

      {showCompanyEmailWarning && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[60]">
          <div className="bg-white rounded-[12px] shadow-2xl p-6 w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-grey-15 mb-1">Company email not set up</h3>
                <p className="text-sm text-grey-35">You need to configure a company sender email before automations can send to it.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCompanyEmailWarning(false)} className="btn-secondary flex-1">Cancel</button>
              <Link href="/dashboard/settings?tab=email" className="btn-primary flex-1 text-center">Go to Settings</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
