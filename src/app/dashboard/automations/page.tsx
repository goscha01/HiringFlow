'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { DEFAULT_EMAIL_TEMPLATES } from '@/lib/email-templates-seed'
import { Button, PageHeader } from '@/components/design'

interface Flow { id: string; name: string }
interface Template { id: string; name: string; subject: string }
interface TrainingItem { id: string; title: string; slug: string }
interface SchedulingItem { id: string; name: string; schedulingUrl: string }
interface Rule {
  id: string; name: string; triggerType: string; flowId: string | null
  actionType: string; emailTemplateId: string; nextStepType: string | null
  nextStepUrl: string | null; trainingId: string | null; schedulingConfigId: string | null
  emailDestination: 'applicant' | 'company' | 'specific'
  emailDestinationAddress: string | null
  delayMinutes?: number
  minutesBefore?: number | null
  waitForRecording?: boolean
  isActive: boolean; createdAt: string
  flow: Flow | null; emailTemplate: Template; training: TrainingItem | null
  schedulingConfig: SchedulingItem | null; _count: { executions: number }
}

// Canonical pipeline order (left-to-right). automation_completed is chained
// and shown as a separate tail section, not on the main pipeline.
const PIPELINE_ORDER: Array<{ value: string; label: string; group: 'flow' | 'training' | 'meeting' }> = [
  { value: 'flow_completed',     label: 'Flow Completed',   group: 'flow' },
  { value: 'flow_passed',        label: 'Flow Passed',      group: 'flow' },
  { value: 'training_completed', label: 'Training Done',    group: 'training' },
  { value: 'meeting_scheduled',  label: 'Meeting Scheduled',group: 'meeting' },
  { value: 'before_meeting',     label: 'Before Meeting',   group: 'meeting' },
  { value: 'meeting_started',    label: 'Meeting Started',  group: 'meeting' },
  { value: 'meeting_ended',      label: 'Meeting Ended',    group: 'meeting' },
  { value: 'meeting_no_show',    label: 'No-show',          group: 'meeting' },
  { value: 'recording_ready',    label: 'Recording Ready',  group: 'meeting' },
  { value: 'transcript_ready',   label: 'Transcript Ready', group: 'meeting' },
]

type DestinationFilter = 'all' | 'applicant' | 'company'

const TRIGGERS = [
  { value: 'flow_completed', label: 'Flow Completed' },
  { value: 'flow_passed', label: 'Flow Passed' },
  { value: 'training_completed', label: 'Training Done' },
  { value: 'meeting_scheduled', label: 'Meeting Scheduled' },
  { value: 'before_meeting', label: 'Before Meeting' },
  { value: 'meeting_started', label: 'Meeting Started' },
  { value: 'meeting_ended', label: 'Meeting Ended' },
  { value: 'meeting_no_show', label: 'No-show' },
  { value: 'recording_ready', label: 'Recording Ready' },
  { value: 'transcript_ready', label: 'Transcript Ready' },
  { value: 'automation_completed', label: 'After Automation' },
]

// Triggers that are session-wide (not tied to a specific flow). Used to hide
// the Flow picker from the rule form when these are selected.
const SESSION_WIDE_TRIGGERS = new Set([
  'training_completed',
  'automation_completed',
  'meeting_scheduled',
  'before_meeting',
  'meeting_started',
  'meeting_ended',
  'meeting_no_show',
  'recording_ready',
  'transcript_ready',
])

const TRIGGER_LABELS: Record<string, string> = {
  flow_completed: 'Flow Completed',
  flow_passed: 'Flow Passed',
  training_completed: 'Training Done',
  meeting_scheduled: 'Meeting Scheduled',
  before_meeting: 'Before Meeting',
  meeting_started: 'Meeting Started',
  meeting_ended: 'Meeting Ended',
  meeting_no_show: 'No-show',
  recording_ready: 'Recording Ready',
  transcript_ready: 'Transcript Ready',
  automation_completed: 'After Automation',
}

export default function AutomationsPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [trainings, setTrainings] = useState<TrainingItem[]>([])
  const [schedulingConfigs, setSchedulingConfigs] = useState<SchedulingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [destinationFilter, setDestinationFilter] = useState<DestinationFilter>('all')
  const [triggerFilter, setTriggerFilter] = useState<string | null>(null)
  const [activeOnly, setActiveOnly] = useState(false)
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
  const [minutesBefore, setMinutesBefore] = useState(60)
  const [waitForRecording, setWaitForRecording] = useState(false)
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

  const [seedingNoShow, setSeedingNoShow] = useState(false)
  const seedNoShow = async () => {
    setSeedingNoShow(true)
    try {
      const r = await fetch('/api/automations/seed-no-show', { method: 'POST' })
      if (r.ok) {
        await refresh()
        const t = await fetch('/api/email-templates').then(r => r.json())
        setTemplates(t)
      }
    } finally {
      setSeedingNoShow(false)
    }
  }

  type PreviewData = {
    subject: string
    html: string
    text: string | null
    recipient: string
    from: { name: string; email: string }
    templateName: string
    ruleName: string
  } | null
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData>(null)
  const openPreview = async (r: Rule) => {
    setPreviewLoading(r.id)
    try {
      const res = await fetch(`/api/automations/${r.id}/preview`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(`Preview failed: ${data.error || res.statusText}`)
        return
      }
      const data = await res.json()
      setPreview({ ...data, ruleName: r.name })
    } finally {
      setPreviewLoading(null)
    }
  }

  const openCreate = () => {
    setEditing(null); setName(''); setTriggerType('flow_completed'); setFlowId('')
    setTemplateId(templates[0]?.id || ''); setNextStepType(''); setNextStepUrl('')
    setTrainingId(''); setSchedulingConfigId(''); setDelayMinutes(0); setMinutesBefore(60)
    setEmailDestination('applicant'); setEmailDestinationAddress('')
    setShowModal(true)
  }
  const openEdit = (r: Rule) => {
    setEditing(r); setName(r.name); setTriggerType(r.triggerType); setFlowId(r.flowId || (r as any).triggerAutomationId || '')
    setTemplateId(r.emailTemplateId); setNextStepType(r.nextStepType || ''); setNextStepUrl(r.nextStepUrl || '')
    setTrainingId(r.trainingId || ''); setSchedulingConfigId(r.schedulingConfigId || '')
    setDelayMinutes((r as any).delayMinutes || 0)
    setMinutesBefore((r as any).minutesBefore || 60)
    setWaitForRecording(!!(r as any).waitForRecording)
    setEmailDestination(((r as any).emailDestination as 'applicant' | 'company' | 'specific') || 'applicant')
    setEmailDestinationAddress((r as any).emailDestinationAddress || '')
    setShowModal(true)
  }

  const save = async () => {
    if (!name.trim() || !templateId) return
    setSaving(true)
    const body = {
      name, triggerType,
      flowId: (!SESSION_WIDE_TRIGGERS.has(triggerType)) ? (flowId || null) : null,
      triggerAutomationId: triggerType === 'automation_completed' ? (flowId || null) : null,
      emailTemplateId: templateId,
      nextStepType: nextStepType || null,
      nextStepUrl: null as string | null,
      trainingId: nextStepType === 'training' ? (trainingId || null) : null,
      schedulingConfigId: nextStepType === 'scheduling' ? (schedulingConfigId || null) : null,
      delayMinutes: triggerType === 'before_meeting' ? 0 : delayMinutes,
      minutesBefore: triggerType === 'before_meeting' ? minutesBefore : null,
      waitForRecording: triggerType === 'meeting_ended' ? waitForRecording : false,
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
        alert(`Test email sent to ${data.sentTo}.\nA tracked candidate was created (source: test) — view it in Candidates to follow the path.`)
      } else if (res.ok && data.sessionId) {
        alert(`Candidate was created but the email did not send: ${data.error || 'unknown error'}.\nYou can still view the candidate in Candidates.`)
      } else {
        alert(`Test failed: ${data.error || 'Unknown error'}`)
      }
    } finally {
      setTestingId(null)
    }
  }

  if (loading) return <div className="py-14 text-center font-mono text-[11px] uppercase text-grey-35" style={{ letterSpacing: '0.1em' }}>Loading…</div>

  return (
    <div className="-mx-6 lg:-mx-[132px]">
      <PageHeader
        eyebrow={`${rules.length} rule${rules.length === 1 ? '' : 's'}`}
        title="Automations"
        description="Trigger emails when candidates complete flows, trainings, or interviews."
        actions={
          <>
            <Link href="/dashboard/content" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-ink bg-transparent border border-surface-border hover:bg-surface-light transition-colors">
              Templates
            </Link>
            <Button size="sm" onClick={openCreate}>+ New rule</Button>
          </>
        }
      />

      <div className="px-8 py-6">

      {!rules.some((r) => r.triggerType === 'meeting_no_show') && (
        <div className="mb-4 px-4 py-3 rounded-[10px] bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
          <div className="text-[13px] text-amber-900">
            <span className="font-medium">No no-show follow-up yet.</span>{' '}
            We&apos;ll detect candidate no-shows automatically and move them to Rejected. Add a default email
            so they&apos;re invited to re-book.
          </div>
          <button
            onClick={seedNoShow}
            disabled={seedingNoShow}
            className="text-xs px-3 py-1.5 rounded-[8px] bg-amber-600 text-white hover:bg-amber-700 font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {seedingNoShow ? 'Setting up…' : 'Add default no-show email'}
          </button>
        </div>
      )}

      {rules.length > 0 && <AutomationPipeline
        rules={rules}
        activeTrigger={triggerFilter}
        onPickTrigger={(t) => setTriggerFilter(triggerFilter === t ? null : t)}
      />}

      {rules.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-grey-40 mr-2">Filter:</span>
          {([
            { v: 'all' as const, l: `All (${rules.length})` },
            { v: 'applicant' as const, l: `Applicant (${rules.filter(r => r.emailDestination === 'applicant').length})` },
            { v: 'company' as const, l: `Company (${rules.filter(r => r.emailDestination !== 'applicant').length})` },
          ]).map((o) => (
            <button key={o.v} onClick={() => setDestinationFilter(o.v)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium ${destinationFilter === o.v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}>
              {o.l}
            </button>
          ))}
          <button onClick={() => setActiveOnly(!activeOnly)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium ${activeOnly ? 'border-green-500 bg-green-50 text-green-700' : 'border-surface-border text-grey-35'}`}>
            Active only
          </button>
          {triggerFilter && (
            <button onClick={() => setTriggerFilter(null)}
              className="text-xs px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 font-medium">
              {TRIGGER_LABELS[triggerFilter] || triggerFilter} ×
            </button>
          )}
        </div>
      )}

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
              {rules
                .filter(r => destinationFilter === 'all' || (destinationFilter === 'applicant' ? r.emailDestination === 'applicant' : r.emailDestination !== 'applicant'))
                .filter(r => !activeOnly || r.isActive)
                .filter(r => !triggerFilter || r.triggerType === triggerFilter)
                .map((r) => (
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
                    {r.triggerType === 'before_meeting' && (r as any).minutesBefore > 0 ? (
                      <>
                        {(r as any).minutesBefore >= 1440 ? `${Math.round((r as any).minutesBefore / 1440)}d` :
                          (r as any).minutesBefore >= 60 ? `${Math.round((r as any).minutesBefore / 60)}h` :
                          `${(r as any).minutesBefore}m`} before
                      </>
                    ) : (r as any).delayMinutes > 0 ? (
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
                    <button onClick={() => openPreview(r)} disabled={previewLoading === r.id} className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50">
                      {previewLoading === r.id ? 'Loading…' : 'Preview'}
                    </button>
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

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div
            className="bg-white rounded-[12px] shadow-2xl w-full max-w-[760px] max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-surface-border flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs text-grey-40 font-medium uppercase tracking-wide">Email preview</div>
                <h2 className="text-lg font-semibold text-grey-15 truncate">{preview.ruleName}</h2>
                <div className="text-xs text-grey-40 mt-0.5">Template: {preview.templateName}</div>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="text-grey-40 hover:text-grey-15 text-xl leading-none px-2"
                aria-label="Close"
              >×</button>
            </div>
            <div className="px-6 py-4 border-b border-surface-border bg-surface-light text-[13px] space-y-1.5">
              <div className="flex gap-2"><span className="text-grey-40 w-16 flex-shrink-0">From</span><span className="text-grey-15">{preview.from.name} &lt;{preview.from.email}&gt;</span></div>
              <div className="flex gap-2"><span className="text-grey-40 w-16 flex-shrink-0">To</span><span className="text-grey-15">{preview.recipient}</span></div>
              <div className="flex gap-2"><span className="text-grey-40 w-16 flex-shrink-0">Subject</span><span className="text-grey-15 font-medium">{preview.subject}</span></div>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="p-6 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: preview.html }} />
            </div>
            <div className="px-6 py-3 border-t border-surface-border bg-surface-light flex items-center justify-between text-xs text-grey-40">
              <span>Sample values shown for merge tokens. No email sent.</span>
              <button onClick={() => setPreview(null)} className="text-grey-15 hover:text-grey-40 font-medium">Close</button>
            </div>
          </div>
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
                <div className="flex gap-2 flex-wrap">
                  {TRIGGERS.map(t => (
                    <button key={t.value} onClick={() => setTriggerType(t.value)} className={`py-2.5 px-3 text-xs rounded-[8px] border font-medium ${triggerType === t.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}>{t.label}</button>
                  ))}
                </div>
              </div>
              {triggerType === 'meeting_ended' && (
                <div className="p-3 bg-surface-weak rounded-[8px]">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={waitForRecording} onChange={(e) => setWaitForRecording(e.target.checked)} className="mt-0.5 h-4 w-4" />
                    <div className="text-xs">
                      <div className="font-medium text-grey-15">Wait for recording before sending</div>
                      <div className="text-grey-40 mt-0.5">Send the email only after Meet finishes processing the recording (usually within 10 minutes). Falls back after 4 hours if the recording never lands. Only meaningful if the meeting was recorded.</div>
                    </div>
                  </label>
                </div>
              )}
              {!SESSION_WIDE_TRIGGERS.has(triggerType) && (
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
                      <div className="grid grid-cols-2 gap-1.5 mb-2 max-h-[240px] overflow-y-auto">
                        {DEFAULT_EMAIL_TEMPLATES.map((tpl, i) => (
                          <button key={i} onClick={() => { setNewTplName(tpl.name); setNewTplSubject(tpl.subject); setNewTplBody(tpl.bodyHtml); setShowNewTemplate(true); setTemplateId('') }} className="px-3 py-2 text-xs text-left border border-surface-border rounded-[6px] text-grey-35 hover:border-brand-400 hover:bg-brand-50 transition-colors">
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
              {/* Send X minutes before meeting — only for before_meeting trigger */}
              {triggerType === 'before_meeting' && (
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Send before meeting</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 15, label: '15 min before' },
                    { value: 60, label: '1 hour before' },
                    { value: 180, label: '3 hours before' },
                    { value: 1440, label: '1 day before' },
                    { value: 2880, label: '2 days before' },
                  ].map(d => (
                    <button key={d.value} onClick={() => setMinutesBefore(d.value)} className={`px-3 py-1.5 text-xs rounded-[6px] border font-medium ${minutesBefore === d.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35 hover:bg-surface'}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    value={minutesBefore > 0 ? minutesBefore : ''}
                    onChange={(e) => setMinutesBefore(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-24 px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <span className="text-xs text-grey-40">minutes before scheduled start</span>
                </div>
                <p className="text-xs text-grey-50 mt-1.5">
                  Reminder fires {minutesBefore >= 1440 ? `${Math.round(minutesBefore / 1440)} day${minutesBefore >= 2880 ? 's' : ''}` : minutesBefore >= 60 ? `${Math.round(minutesBefore / 60)} hour${minutesBefore >= 120 ? 's' : ''}` : `${minutesBefore} minutes`} before the meeting&apos;s scheduled start.
                  Auto-cancelled if the candidate cancels or reschedules.
                </p>
              </div>
              )}
              {/* Delay — only show when a next step is selected and trigger is not before_meeting */}
              {nextStepType && triggerType !== 'before_meeting' && (
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
    </div>
  )
}

/**
 * Two-row pipeline view — applicant journey on top, company notifications
 * below. Each stage is a clickable chip that filters the rules table to
 * automations for that trigger. Lifecycle events (Meeting Started/Ended,
 * Recording/Transcript Ready) are visually grouped together so the
 * post-meeting cluster is easy to scan.
 */
function AutomationPipeline({
  rules,
  activeTrigger,
  onPickTrigger,
}: {
  rules: Rule[]
  activeTrigger: string | null
  onPickTrigger: (trigger: string) => void
}) {
  const countsByTriggerAndDest = (() => {
    const m = new Map<string, { applicant: number; company: number }>()
    for (const t of PIPELINE_ORDER) m.set(t.value, { applicant: 0, company: 0 })
    for (const r of rules) {
      const bucket = m.get(r.triggerType)
      if (!bucket) continue
      const bucketKey = r.emailDestination === 'applicant' ? 'applicant' : 'company'
      bucket[bucketKey] += 1
    }
    return m
  })()

  const groupColor = (g: string) => g === 'flow' ? 'bg-blue-50 text-blue-700 border-blue-100'
    : g === 'training' ? 'bg-amber-50 text-amber-700 border-amber-100'
    : 'bg-purple-50 text-purple-700 border-purple-100'

  const row = (dest: 'applicant' | 'company', title: string, subtitle: string) => {
    const total = PIPELINE_ORDER.reduce((sum, t) => sum + (countsByTriggerAndDest.get(t.value)?.[dest] || 0), 0)
    return (
      <div className="bg-white rounded-[12px] border border-surface-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs font-semibold text-grey-15 uppercase tracking-wide">{title}</div>
            <div className="text-xs text-grey-40 mt-0.5">{subtitle}</div>
          </div>
          <span className="text-xs text-grey-40">{total} rule{total === 1 ? '' : 's'}</span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PIPELINE_ORDER.map((stage, i) => {
            const count = countsByTriggerAndDest.get(stage.value)?.[dest] || 0
            const isActive = activeTrigger === stage.value
            const empty = count === 0
            return (
              <div key={stage.value} className="flex items-center shrink-0">
                <button
                  onClick={() => onPickTrigger(stage.value)}
                  className={`px-3 py-2 rounded-[8px] border text-xs font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
                      : empty
                        ? 'border-dashed border-surface-border text-grey-40 bg-white hover:border-grey-25'
                        : `border-transparent ${groupColor(stage.group)} hover:ring-1 hover:ring-grey-25`
                  }`}
                >
                  <span>{stage.label}</span>
                  <span className={`ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold ${
                    empty ? 'bg-gray-100 text-grey-40' : 'bg-white/70 text-grey-15'
                  }`}>
                    {count}
                  </span>
                </button>
                {i < PIPELINE_ORDER.length - 1 && (
                  <svg className="w-3 h-3 text-grey-40 shrink-0" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                    <path d="M4 2l4 4-4 4V2z" />
                  </svg>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6 space-y-3">
      {row('applicant', 'Applicant journey', 'Emails sent to the candidate as they move through the pipeline')}
      {row('company', 'Company notifications', 'Emails sent to your team or a specific inbox')}
    </div>
  )
}
