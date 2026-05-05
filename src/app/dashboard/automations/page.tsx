'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { DEFAULT_EMAIL_TEMPLATES } from '@/lib/email-templates-seed'
import { Button, PageHeader } from '@/components/design'

interface Flow { id: string; name: string }
interface Template { id: string; name: string; subject: string; bodyHtml?: string; bodyText?: string | null }
interface TrainingItem { id: string; title: string; slug: string }
interface SchedulingItem { id: string; name: string; schedulingUrl: string }

interface StepShape {
  id?: string
  order: number
  delayMinutes: number
  timingMode: 'trigger' | 'before_meeting' | 'after_meeting'
  channel: 'email' | 'sms' | 'both'
  emailTemplateId: string | null
  smsBody: string | null
  emailDestination: 'applicant' | 'company' | 'specific'
  emailDestinationAddress: string | null
  nextStepType: string | null
  nextStepUrl: string | null
  trainingId: string | null
  schedulingConfigId: string | null
  // For UI display only — populated by the API on GET.
  emailTemplate?: Template | null
  training?: TrainingItem | null
  schedulingConfig?: SchedulingItem | null
}

interface Rule {
  id: string; name: string; triggerType: string; flowId: string | null
  // Legacy mirror fields — still populated, but not authoritative.
  channel?: 'email' | 'sms'
  smsBody?: string | null
  delayMinutes?: number
  minutesBefore?: number | null
  waitForRecording?: boolean
  emailDestination?: 'applicant' | 'company' | 'specific'
  emailDestinationAddress?: string | null
  emailTemplateId?: string | null
  nextStepType?: string | null
  nextStepUrl?: string | null
  trainingId?: string | null
  schedulingConfigId?: string | null
  isActive: boolean; createdAt: string
  flow: Flow | null; emailTemplate: Template | null; training: TrainingItem | null
  schedulingConfig: SchedulingItem | null; _count: { executions: number }
  steps: StepShape[]
}

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

const DELAY_PRESETS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Immediately' },
  { value: 15, label: '15 min' },
  { value: 60, label: '1 hour' },
  { value: 360, label: '6 hours' },
  { value: 1440, label: '1 day' },
  { value: 4320, label: '3 days' },
  { value: 10080, label: '7 days' },
]

// Trigger-aware SMS bodies. The textarea's placeholder is just the
// HTML placeholder attribute — it LOOKS like content but doesn't count.
// We prefill the actual smsBody field with these when the recruiter
// switches a step to SMS so the rule is ready to save without typing.
const TRIGGER_TO_SMS_BODY: Record<string, string> = {
  flow_completed:     'Hi {{candidate_name}}, thanks for applying to {{flow_name}}. We received your application — we\'ll be in touch.',
  flow_passed:        'Hi {{candidate_name}}, you passed the screening for {{flow_name}}! Next step: {{training_link}}',
  training_completed: 'Hi {{candidate_name}}, training done! Book your interview: {{schedule_link}}',
  meeting_scheduled:  'Hi {{candidate_name}}, your interview is confirmed for {{meeting_time}}. Join: {{meeting_link}}',
  before_meeting:     'Hi {{candidate_name}}, reminder: your interview starts at {{meeting_time}}. Join: {{meeting_link}}',
  meeting_started:    'Hi {{candidate_name}}, we just started the interview — join here: {{meeting_link}}',
  meeting_ended:      'Hi {{candidate_name}}, thanks for the interview. We\'ll follow up with next steps soon.',
  meeting_no_show:    'Hi {{candidate_name}}, we missed you for the interview. Pick a new time: {{schedule_link}}',
  recording_ready:    'Hi {{candidate_name}}, the recording from your interview is ready: {{recording_link}}',
  transcript_ready:   'Hi {{candidate_name}}, the transcript from your interview is ready: {{transcript_link}}',
  automation_completed: 'Hi {{candidate_name}}, just checking in regarding your application for {{flow_name}}.',
}
const DEFAULT_SMS_BODY = 'Hi {{candidate_name}}, this is a quick note about your application for {{flow_name}}.'

function pickDefaultSmsBody(triggerType: string): string {
  return TRIGGER_TO_SMS_BODY[triggerType] || DEFAULT_SMS_BODY
}

/**
 * Look at the rendered text of a template (subject + body) or an SMS body
 * and infer which "Includes link to" option matches the merge tokens used.
 * Priority: training > scheduling > meet_link. Returns null if none matched.
 */
type LinkType = 'training' | 'scheduling' | 'meet_link'
function detectLinkType(content: string | null | undefined): LinkType | null {
  if (!content) return null
  if (content.includes('{{training_link}}')) return 'training'
  if (content.includes('{{schedule_link}}')) return 'scheduling'
  if (content.includes('{{meeting_link}}')) return 'meet_link'
  return null
}

function detectStepLinkType(step: StepShape, templates: Template[]): LinkType | null {
  // Combine subject + body of the picked email template (if any) with the SMS body.
  const tpl = step.emailTemplateId ? templates.find((t) => t.id === step.emailTemplateId) : null
  const haystack = [tpl?.subject || '', tpl?.bodyHtml || '', tpl?.bodyText || '', step.smsBody || ''].join(' ')
  return detectLinkType(haystack)
}

// Map trigger types to the most-relevant default template name. Used to
// prefill a sensible starter template when a recruiter opens "+ New rule"
// — they shouldn't have to pick from a dropdown to see what will be sent.
const TRIGGER_TO_TEMPLATE_NAME: Record<string, string> = {
  flow_completed:     'Form Submit Confirmation',
  flow_passed:        'Training Invitation',
  training_completed: 'Scheduling Invitation',
  meeting_scheduled:  'Interview Confirmation',
  before_meeting:     'Interview Reminder',
  meeting_started:    'Generic Follow-up',
  meeting_ended:      'Interview Follow-up (Post-meeting)',
  meeting_no_show:    'Rejection Email',
  recording_ready:    'Generic Follow-up',
  transcript_ready:   'Generic Follow-up',
  automation_completed: 'Generic Follow-up',
}

function pickDefaultTemplateId(triggerType: string, templates: Template[]): string | undefined {
  if (templates.length === 0) return undefined
  const preferredName = TRIGGER_TO_TEMPLATE_NAME[triggerType]
  if (preferredName) {
    const match = templates.find((t) => t.name === preferredName)
    if (match) return match.id
  }
  return templates[0].id
}

function newStep(order: number, defaultTemplateId?: string): StepShape {
  return {
    order,
    delayMinutes: 0,
    timingMode: 'trigger',
    channel: 'email',
    emailTemplateId: defaultTemplateId ?? null,
    smsBody: null,
    emailDestination: 'applicant',
    emailDestinationAddress: null,
    nextStepType: null,
    nextStepUrl: null,
    trainingId: null,
    schedulingConfigId: null,
  }
}

// Triggers tied to an actual InterviewMeeting — these are the only triggers
// where step.timingMode='before_meeting' / 'after_meeting' makes sense.
const MEETING_TRIGGERS = new Set(['meeting_scheduled', 'before_meeting', 'meeting_started', 'meeting_ended', 'recording_ready'])

function formatDelay(m: number): string {
  if (m <= 0) return 'Instant'
  if (m >= 1440) return `${Math.round(m / 1440)}d`
  if (m >= 60) return `${Math.round(m / 60)}h`
  return `${m}m`
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
  const [minutesBefore, setMinutesBefore] = useState(60)
  const [waitForRecording, setWaitForRecording] = useState(false)
  const [steps, setSteps] = useState<StepShape[]>([newStep(0)])
  // Index of the step the inline template creator is currently bound to.
  const [templateEditorStepIdx, setTemplateEditorStepIdx] = useState<number | null>(null)
  // When the editor opens (idx becomes non-null), pull it into view AND
  // clear any stale save error from a previous attempt.
  useEffect(() => {
    if (templateEditorStepIdx !== null) {
      setTplSaveError(null)
      // Defer to next frame so the editor is in the DOM before we scroll.
      requestAnimationFrame(() => {
        tplEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
  }, [templateEditorStepIdx])
  const [companyEmail, setCompanyEmail] = useState<string | null>(null)
  const [showCompanyEmailWarning, setShowCompanyEmailWarning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  // Inline template creator
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

  // Inject a {{xxx_link}} CTA into a workspace template's bodyHtml so the
  // recruiter doesn't have to hand-edit the template. Idempotent — does
  // nothing if the token is already present. The CTA uses the configured
  // training/scheduling name as the label when available, falling back to
  // a generic "Continue" / "Book interview" / "Join interview".
  //
  // Placement: inserts a new <p> immediately BEFORE the last <p> in the
  // body so the link sits above the signature line ("Best,/The Hiring
  // Team") — a sensible default. The recruiter can move it later by
  // hand-editing the template; we don't lock placement.
  const insertTokenInTemplate = async (
    templateId: string,
    kind: 'training' | 'scheduling' | 'meet_link',
    label: string,
  ): Promise<boolean> => {
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl || !tpl.bodyHtml) return false
    const tokenMap = { training: '{{training_link}}', scheduling: '{{schedule_link}}', meet_link: '{{meeting_link}}' }
    const token = tokenMap[kind]
    if (tpl.bodyHtml.includes(token)) return true // already present
    const ctaHtml = `<p style="margin:24px 0"><a href="${token}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold">${label}</a></p>`
    const lastOpen = tpl.bodyHtml.lastIndexOf('<p')
    const newBody = lastOpen === -1
      ? tpl.bodyHtml + '\n' + ctaHtml
      : tpl.bodyHtml.slice(0, lastOpen) + ctaHtml + '\n' + tpl.bodyHtml.slice(lastOpen)
    try {
      const r = await fetch(`/api/email-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyHtml: newBody }),
      })
      if (!r.ok) return false
      const refreshed = await fetch('/api/email-templates')
      if (refreshed.ok) setTemplates(await refreshed.json())
      return true
    } catch {
      return false
    }
  }

  // Same idea for SMS — inject token at end of step.smsBody (in step
  // state, no API call). The step is saved when the recruiter clicks
  // Save on the rule modal.
  const insertTokenInSmsBody = (stepIdx: number, kind: 'training' | 'scheduling' | 'meet_link') => {
    const tokenMap = { training: '{{training_link}}', scheduling: '{{schedule_link}}', meet_link: '{{meeting_link}}' }
    const token = tokenMap[kind]
    setSteps((prev) => prev.map((s, i) => {
      if (i !== stepIdx) return s
      const cur = s.smsBody || ''
      if (cur.includes(token)) return s
      return { ...s, smsBody: cur ? `${cur}\n${token}` : token }
    }))
  }

  // One-click "create from default" — used by the StepCard's template
  // dropdown when the recruiter picks a default that isn't yet in the
  // workspace. Returns the new template's id (or null on failure).
  const createDefaultTemplate = async (tpl: { name: string; subject: string; bodyHtml: string }): Promise<string | null> => {
    try {
      const r = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tpl.name, subject: tpl.subject, bodyHtml: tpl.bodyHtml }),
      })
      if (!r.ok) return null
      const newTpl = await r.json()
      const tplRes = await fetch('/api/email-templates')
      if (tplRes.ok) setTemplates(await tplRes.json())
      return newTpl.id as string
    } catch {
      return null
    }
  }

  // Ref on the inline template editor so we can scroll it into view when
  // it opens — otherwise clicking "Edit" on a step buried near the bottom
  // of the modal silently puts the editor below the visible area and the
  // recruiter thinks the button didn't work.
  const tplEditorRef = useRef<HTMLDivElement>(null)
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
    channel?: 'email' | 'sms'
    subject?: string
    html?: string
    text?: string | null
    smsBody?: string
    length?: number
    segments?: number
    recipient: string
    from: { name: string; email: string }
    templateName: string
    ruleName: string
    stepOrder?: number
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

  // Draft preview — preview an unsaved step from the create/edit modal.
  // Per-step + per-channel: 'both' steps need two previews, the recruiter
  // toggles via the channel arg.
  const [draftPreviewLoading, setDraftPreviewLoading] = useState(false)
  const previewDraftStep = async (idx: number, channelOverride?: 'email' | 'sms') => {
    const step = steps[idx]
    if (!step) return
    const ch = channelOverride
      ?? (step.channel === 'sms' ? 'sms' : 'email')
    setDraftPreviewLoading(true)
    try {
      const res = await fetch('/api/automations/preview-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: ch,
          emailTemplateId: step.emailTemplateId,
          smsBody: step.smsBody,
          nextStepType: step.nextStepType,
          trainingId: step.trainingId,
          schedulingConfigId: step.schedulingConfigId,
          emailDestination: step.emailDestination,
          emailDestinationAddress: step.emailDestinationAddress,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(`Preview failed: ${data.error || res.statusText}`)
        return
      }
      const data = await res.json()
      setPreview({ ...data, ruleName: name || '(unsaved rule)', stepOrder: idx })
    } finally {
      setDraftPreviewLoading(false)
    }
  }

  const openCreate = async () => {
    setEditing(null)
    const trigger = 'flow_completed'
    setTriggerType(trigger)
    setName(`${TRIGGER_LABELS[trigger]} follow-up`)
    setFlowId('')
    setMinutesBefore(60); setWaitForRecording(false)

    // Always run seed — it's idempotent on the server (inserts only the
    // default templates whose names don't already exist). This way, when
    // we add new entries to DEFAULT_EMAIL_TEMPLATES in code, existing
    // workspaces pick them up automatically on next "+ New rule"
    // — not just brand-new workspaces with empty templates.
    let availableTemplates = templates
    try {
      const seedRes = await fetch('/api/email-templates/seed', { method: 'POST' })
      const seedData = seedRes.ok ? await seedRes.json().catch(() => null) : null
      // Only re-fetch if seed actually created something new, or if we
      // started with an empty list (first open on a fresh workspace).
      if ((seedData && seedData.created > 0) || availableTemplates.length === 0) {
        const r = await fetch('/api/email-templates')
        if (r.ok) {
          availableTemplates = await r.json()
          setTemplates(availableTemplates)
        }
      }
    } catch { /* fall through with current templates */ }
    const prefillId = pickDefaultTemplateId(trigger, availableTemplates)
    setSteps([newStep(0, prefillId)])
    setTemplateEditorStepIdx(null)
    setSaveError(null)
    setShowModal(true)
  }
  const openEdit = (r: Rule) => {
    setEditing(r); setName(r.name); setTriggerType(r.triggerType)
    setFlowId(r.flowId || (r as { triggerAutomationId?: string }).triggerAutomationId || '')
    setMinutesBefore(r.minutesBefore || 60)
    setWaitForRecording(!!r.waitForRecording)
    // Hydrate steps. Older rules may have an empty steps[] (pre-backfill).
    // Synthesize a single step from the legacy rule fields in that case so
    // the editor stays usable until the backfill runs.
    if (r.steps && r.steps.length > 0) {
      setSteps(r.steps.map((s, i) => {
        const tm = (s as StepShape).timingMode
        return {
          ...s,
          order: i,
          channel: (s.channel === 'sms' || s.channel === 'both') ? s.channel : 'email',
          timingMode: (tm === 'before_meeting' || tm === 'after_meeting') ? tm : 'trigger',
          emailDestination: (s.emailDestination as StepShape['emailDestination']) || 'applicant',
        }
      }))
    } else {
      setSteps([{
        order: 0,
        delayMinutes: r.delayMinutes ?? 0,
        timingMode: 'trigger',
        channel: r.channel === 'sms' ? 'sms' : 'email',
        emailTemplateId: r.emailTemplateId ?? null,
        smsBody: r.smsBody ?? null,
        emailDestination: (r.emailDestination as StepShape['emailDestination']) || 'applicant',
        emailDestinationAddress: r.emailDestinationAddress ?? null,
        nextStepType: r.nextStepType ?? null,
        nextStepUrl: r.nextStepUrl ?? null,
        trainingId: r.trainingId ?? null,
        schedulingConfigId: r.schedulingConfigId ?? null,
      }])
    }
    setTemplateEditorStepIdx(null)
    setSaveError(null)
    setShowModal(true)
  }

  const updateStep = (idx: number, patch: Partial<StepShape>) => {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }
  const addStep = () => {
    setSteps((prev) => [...prev, {
      ...newStep(prev.length, templates[0]?.id),
      delayMinutes: 1440, // follow-ups default to 1 day after the trigger
    }])
  }
  const removeStep = (idx: number) => {
    setSteps((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })))
    if (templateEditorStepIdx === idx) setTemplateEditorStepIdx(null)
  }
  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next.map((s, i) => ({ ...s, order: i }))
    })
  }

  const save = async () => {
    setSaveError(null)
    if (!name.trim()) { setSaveError('Name is required'); return }
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      const wantsEmail = s.channel === 'email' || s.channel === 'both'
      const wantsSms = s.channel === 'sms' || s.channel === 'both'
      if (wantsEmail && !s.emailTemplateId) { setSaveError(`Step ${i + 1}: pick an email template`); return }
      if (wantsSms && (!s.smsBody || !s.smsBody.trim())) { setSaveError(`Step ${i + 1}: SMS body is required`); return }
    }

    setSaving(true)
    const body = {
      name, triggerType,
      flowId: (!SESSION_WIDE_TRIGGERS.has(triggerType)) ? (flowId || null) : null,
      triggerAutomationId: triggerType === 'automation_completed' ? (flowId || null) : null,
      minutesBefore: triggerType === 'before_meeting' ? minutesBefore : null,
      waitForRecording: triggerType === 'meeting_ended' ? waitForRecording : false,
      steps: steps.map((s, i) => ({
        order: i,
        delayMinutes: s.delayMinutes ?? 0,
        timingMode: s.timingMode ?? 'trigger',
        channel: s.channel,
        emailTemplateId: s.emailTemplateId,
        smsBody: s.smsBody,
        emailDestination: s.emailDestination,
        emailDestinationAddress: s.emailDestinationAddress,
        nextStepType: s.nextStepType,
        nextStepUrl: s.nextStepUrl,
        trainingId: s.trainingId,
        schedulingConfigId: s.schedulingConfigId,
      })),
    }
    try {
      const url = editing ? `/api/automations/${editing.id}` : '/api/automations'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError(data.error || `Save failed (${res.status})`)
        return
      }
      setShowModal(false)
      refresh()
    } finally {
      setSaving(false)
    }
  }

  // Auto-suffix the candidate name if a workspace template already uses it.
  // First conflict picks "<Name> (custom)", then "<Name> (custom 2)", ...
  // Lets the recruiter pick a default, edit, and save without manually
  // renaming — the system avoids the duplicate without extra UI.
  const resolveUniqueTemplateName = (candidate: string, existing: { name: string }[]): string => {
    const taken = new Set(existing.map((t) => t.name))
    if (!taken.has(candidate)) return candidate
    if (!taken.has(`${candidate} (custom)`)) return `${candidate} (custom)`
    for (let i = 2; i < 100; i++) {
      const next = `${candidate} (custom ${i})`
      if (!taken.has(next)) return next
    }
    return `${candidate} (custom ${Date.now()})` // last-resort fallback
  }

  const [tplSaveError, setTplSaveError] = useState<string | null>(null)
  const createTemplate = async () => {
    setTplSaveError(null)
    if (!newTplName.trim()) { setTplSaveError('Template name is required'); return }
    if (!newTplSubject.trim()) { setTplSaveError('Subject is required'); return }
    if (!newTplBody.trim()) { setTplSaveError('Body is required'); return }
    setSavingTpl(true)
    const finalName = resolveUniqueTemplateName(newTplName.trim(), templates)
    try {
      const r = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: finalName, subject: newTplSubject, bodyHtml: newTplBody }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        setTplSaveError(data.error || `Save failed (${r.status})`)
        return
      }
      const newTpl = await r.json()
      const tplRes = await fetch('/api/email-templates')
      if (tplRes.ok) setTemplates(await tplRes.json())
      // Bind the new template to the step that opened the editor.
      if (templateEditorStepIdx !== null) {
        updateStep(templateEditorStepIdx, { emailTemplateId: newTpl.id })
      }
      setTemplateEditorStepIdx(null)
      setNewTplName(''); setNewTplSubject(''); setNewTplBody('<p>Hi {{candidate_name}},</p>\n<p></p>')
    } catch (err) {
      setTplSaveError(err instanceof Error ? err.message : 'Save failed')
      return
    } finally {
      setSavingTpl(false)
    }
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
    const firstStepChannel = r.steps?.[0]?.channel ?? r.channel ?? 'email'
    const isSms = firstStepChannel === 'sms'
    const promptText = isSms
      ? `Send a test SMS for "${r.name}" to (E.164, e.g. +15551234567):`
      : `Send a test email for "${r.name}" to:`
    const to = prompt(promptText, '')
    if (!to) return
    if (isSms ? !/^\+?\d[\d\s().-]{6,}$/.test(to) : !to.includes('@')) return
    setTestingId(r.id)
    try {
      const res = await fetch(`/api/automations/${r.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        alert(`Test sent to ${data.sentTo}.\nA tracked candidate was created (source: test) — view it in Candidates to follow the path.`)
      } else if (res.ok && data.sessionId) {
        alert(`Candidate was created but the message did not send: ${data.error || 'unknown error'}.\nYou can still view the candidate in Candidates.`)
      } else {
        alert(`Test failed: ${data.error || 'Unknown error'}`)
      }
    } finally {
      setTestingId(null)
    }
  }

  // Backfill a rule against existing upcoming meetings — useful when the
  // recruiter just added a new reminder rule and wants it to apply to
  // candidates already booked. Only meaningful for meeting_scheduled and
  // before_meeting triggers; other triggers' events are in the past.
  const [backfillingId, setBackfillingId] = useState<string | null>(null)
  const runBackfill = async (r: Rule) => {
    if (!confirm(`Apply "${r.name}" to all candidates with upcoming meetings? Already-sent steps stay sent (no duplicates), but the rule's queued steps will fire for past bookings.`)) return
    setBackfillingId(r.id)
    try {
      const res = await fetch(`/api/automations/${r.id}/backfill`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(`Backfill failed: ${data.error || res.statusText}`)
        return
      }
      alert(`Backfill complete.\n${data.queued ?? 0} of ${data.meetingsConsidered ?? 0} upcoming meetings queued${data.skipped ? `, ${data.skipped} skipped (errors)` : ''}.`)
      refresh()
    } finally {
      setBackfillingId(null)
    }
  }

  if (loading) return <div className="py-14 text-center font-mono text-[11px] uppercase text-grey-35" style={{ letterSpacing: '0.1em' }}>Loading…</div>

  return (
    <div className="-mx-6 lg:-mx-[132px]">
      <PageHeader
        eyebrow={`${rules.length} rule${rules.length === 1 ? '' : 's'}`}
        title="Automations"
        description="Trigger emails and SMS when candidates complete flows, trainings, or interviews."
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
            { v: 'applicant' as const, l: `Applicant (${rules.filter(r => firstStepDest(r) === 'applicant').length})` },
            { v: 'company' as const, l: `Company (${rules.filter(r => firstStepDest(r) !== 'applicant').length})` },
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
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Steps</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">First step</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Sent</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-grey-40 uppercase">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-grey-40 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {rules
                .filter(r => destinationFilter === 'all' || (destinationFilter === 'applicant' ? firstStepDest(r) === 'applicant' : firstStepDest(r) !== 'applicant'))
                .filter(r => !activeOnly || r.isActive)
                .filter(r => !triggerFilter || r.triggerType === triggerFilter)
                .map((r) => {
                  const firstStep = r.steps?.[0]
                  return (
                    <tr key={r.id} className="hover:bg-surface-light">
                      <td className="px-5 py-4 text-sm font-medium text-grey-15">{r.name}</td>
                      <td className="px-5 py-4"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${r.triggerType === 'training_completed' ? 'bg-green-50 text-green-700' : 'bg-brand-50 text-brand-600'}`}>{TRIGGER_LABELS[r.triggerType] || r.triggerType}</span></td>
                      <td className="px-5 py-4 text-sm text-grey-35">{r.flow?.name || 'Any flow'}</td>
                      <td className="px-5 py-4 text-xs text-grey-35">
                        {r.steps && r.steps.length > 0 ? (
                          <span className="inline-flex items-center gap-1 flex-wrap">
                            {r.steps.map((s, i) => (
                              <span key={i} className="inline-flex items-center gap-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wide ${
                                  s.channel === 'both' ? 'bg-violet-50 text-violet-700'
                                  : s.channel === 'sms' ? 'bg-purple-50 text-purple-700'
                                  : 'bg-blue-50 text-blue-700'}`}>
                                  {s.channel === 'both' ? 'E+S' : s.channel === 'sms' ? 'SMS' : 'EMAIL'}
                                </span>
                                <span className="text-[10px] text-grey-40">{formatDelay(s.delayMinutes)}</span>
                                {i < r.steps.length - 1 && <span className="text-grey-50">→</span>}
                              </span>
                            ))}
                          </span>
                        ) : <span className="text-grey-50 italic">No steps</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-grey-35">
                        {firstStep?.channel === 'sms' ? (
                          <span className="truncate max-w-[200px] text-xs text-grey-40 font-mono inline-block">{(firstStep.smsBody || '').slice(0, 60)}{(firstStep.smsBody || '').length > 60 ? '…' : ''}</span>
                        ) : firstStep?.emailTemplate?.name || r.emailTemplate?.name || <span className="text-grey-50 italic">No template</span>}
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
                        {(r.triggerType === 'meeting_scheduled' || r.triggerType === 'before_meeting') && (
                          <button onClick={() => runBackfill(r)} disabled={backfillingId === r.id} className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50" title="Apply this rule to candidates with upcoming meetings already booked">
                            {backfillingId === r.id ? 'Backfilling…' : 'Backfill'}
                          </button>
                        )}
                        <button onClick={() => duplicate(r)} className="text-xs text-grey-35 hover:text-grey-15">Duplicate</button>
                        <button onClick={() => openEdit(r)} className="text-xs text-grey-35 hover:text-grey-15">Edit</button>
                        <button onClick={() => remove(r.id)} className="text-xs text-grey-35 hover:text-grey-15">Delete</button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[60] p-4" onClick={() => setPreview(null)}>
          <div
            className="bg-white rounded-[12px] shadow-2xl w-full max-w-[760px] max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-surface-border flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs text-grey-40 font-medium uppercase tracking-wide">Preview {preview.stepOrder !== undefined ? `· Step ${preview.stepOrder + 1}` : ''}</div>
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
              <div className="flex gap-2"><span className="text-grey-40 w-16 flex-shrink-0">Channel</span><span className="text-grey-15 font-medium uppercase">{preview.channel || 'email'}</span></div>
              <div className="flex gap-2"><span className="text-grey-40 w-16 flex-shrink-0">From</span><span className="text-grey-15">{preview.from.name} &lt;{preview.from.email}&gt;</span></div>
              <div className="flex gap-2"><span className="text-grey-40 w-16 flex-shrink-0">To</span><span className="text-grey-15">{preview.recipient}</span></div>
              {preview.channel !== 'sms' && (
                <div className="flex gap-2"><span className="text-grey-40 w-16 flex-shrink-0">Subject</span><span className="text-grey-15 font-medium">{preview.subject}</span></div>
              )}
              {preview.channel === 'sms' && preview.length !== undefined && (
                <div className="flex gap-2"><span className="text-grey-40 w-16 flex-shrink-0">Length</span><span className="text-grey-15 font-mono">{preview.length} chars · {preview.segments} segment{(preview.segments || 0) > 1 ? 's' : ''}</span></div>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {preview.channel === 'sms' ? (
                <div className="p-6">
                  <div className="max-w-[320px] mx-auto bg-blue-500 text-white rounded-2xl rounded-bl-sm px-4 py-3 text-sm whitespace-pre-wrap break-words shadow">
                    {preview.smsBody}
                  </div>
                </div>
              ) : (
                <div className="p-6 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: preview.html || '' }} />
              )}
            </div>
            <div className="px-6 py-3 border-t border-surface-border bg-surface-light flex items-center justify-between text-xs text-grey-40">
              <span>Sample values shown for merge tokens. No message sent.</span>
              <button onClick={() => setPreview(null)} className="text-grey-15 hover:text-grey-40 font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-[12px] shadow-2xl my-8 p-8 w-full max-w-[640px]" onClick={(e) => e.stopPropagation()}>
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
                      <div className="text-grey-40 mt-0.5">First step waits until Meet finishes processing the recording (usually within 10 minutes). Falls back after 4 hours if the recording never lands. Subsequent follow-up steps still queue at their delays.</div>
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
                  <p className="text-xs text-grey-40 mt-1">This automation will fire after every step of the selected automation completes.</p>
                </div>
              )}
              {triggerType === 'before_meeting' && (
                <div>
                  <label className="block text-sm font-medium text-grey-20 mb-1.5">Step 1 fires</label>
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
                      type="number" min={1}
                      value={minutesBefore > 0 ? minutesBefore : ''}
                      onChange={(e) => setMinutesBefore(Math.max(1, parseInt(e.target.value) || 0))}
                      className="w-24 px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <span className="text-xs text-grey-40">minutes before scheduled start</span>
                  </div>
                  <p className="text-xs text-grey-50 mt-1.5">
                    Step 1 fires {minutesBefore >= 1440 ? `${Math.round(minutesBefore / 1440)} day${minutesBefore >= 2880 ? 's' : ''}` : minutesBefore >= 60 ? `${Math.round(minutesBefore / 60)} hour${minutesBefore >= 120 ? 's' : ''}` : `${minutesBefore} minutes`} before the meeting. Auto-cancelled on cancel/reschedule.
                  </p>
                </div>
              )}

              {/* ─── Steps editor ───────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-grey-20">Steps</label>
                  <span className="text-xs text-grey-40">{steps.length} step{steps.length === 1 ? '' : 's'}</span>
                </div>
                <div className="space-y-3">
                  {steps.map((step, idx) => (
                    <StepCard
                      key={idx}
                      step={step}
                      idx={idx}
                      total={steps.length}
                      isFirst={idx === 0}
                      triggerType={triggerType}
                      templates={templates}
                      trainings={trainings}
                      schedulingConfigs={schedulingConfigs}
                      companyEmail={companyEmail}
                      previewLoading={draftPreviewLoading}
                      isEditingTemplate={templateEditorStepIdx === idx}
                      onChange={(patch) => updateStep(idx, patch)}
                      onRemove={() => removeStep(idx)}
                      onMoveUp={() => moveStep(idx, -1)}
                      onMoveDown={() => moveStep(idx, 1)}
                      onCompanyMissing={() => setShowCompanyEmailWarning(true)}
                      onPreview={(channelOverride) => previewDraftStep(idx, channelOverride)}
                      onCreateDefaultDirect={createDefaultTemplate}
                      onInsertTokenInTemplate={insertTokenInTemplate}
                      onInsertTokenInSmsBody={(kind) => insertTokenInSmsBody(idx, kind)}
                      onCreateTemplate={() => {
                        setTemplateEditorStepIdx(idx)
                        setNewTplName(''); setNewTplSubject(''); setNewTplBody('<p>Hi {{candidate_name}},</p>\n<p></p>')
                      }}
                      onPickDefaultTemplate={(tpl) => {
                        setTemplateEditorStepIdx(idx)
                        setNewTplName(tpl.name); setNewTplSubject(tpl.subject); setNewTplBody(tpl.bodyHtml)
                      }}
                      editorSlot={templateEditorStepIdx === idx ? (
                        <div ref={tplEditorRef} className="p-4 bg-surface rounded-[8px] border border-surface-border space-y-3 ring-2 ring-brand-300/50">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-medium text-grey-15">Template editor</div>
                            <button onClick={() => setTemplateEditorStepIdx(null)} className="text-xs text-grey-40 hover:text-grey-15">Cancel</button>
                          </div>
                          <div>
                            <label className="block text-xs text-grey-40 mb-1">Template Name</label>
                            <input type="text" value={newTplName} onChange={e => setNewTplName(e.target.value)} placeholder="e.g. Training Invitation" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm text-grey-15 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                            {(() => {
                              const trimmed = newTplName.trim()
                              if (!trimmed) return null
                              const conflict = templates.some((t) => t.name === trimmed)
                              if (!conflict) return null
                              const final = resolveUniqueTemplateName(trimmed, templates)
                              return (
                                <p className="mt-1 text-[11px] text-blue-700">
                                  ℹ A template named &ldquo;{trimmed}&rdquo; already exists — this one will be saved as <span className="font-mono font-semibold">{final}</span>.
                                </p>
                              )
                            })()}
                          </div>
                          <div>
                            <label className="block text-xs text-grey-40 mb-1">Subject</label>
                            <input type="text" value={newTplSubject} onChange={e => setNewTplSubject(e.target.value)} placeholder="e.g. Next step: {{flow_name}}" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm text-grey-15 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-grey-40 mb-1">Body (HTML)</label>
                            <textarea value={newTplBody} onChange={e => setNewTplBody(e.target.value)} rows={8} className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm text-grey-15 font-mono focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          </div>
                          <div className="bg-white rounded-[6px] p-2">
                            <label className="text-[10px] font-medium text-grey-40 uppercase block mb-1">Variables</label>
                            <div className="flex flex-wrap gap-1">{['{{candidate_name}}', '{{flow_name}}', '{{training_link}}', '{{schedule_link}}', '{{meeting_link}}', '{{meeting_time}}', '{{source}}', '{{ad_name}}'].map(v => <button key={v} type="button" onClick={() => navigator.clipboard.writeText(v)} className="text-[10px] px-2 py-0.5 bg-surface border border-surface-border rounded text-grey-15 font-mono hover:bg-brand-50">{v}</button>)}</div>
                          </div>
                          {tplSaveError && (
                            <div className="px-3 py-2 rounded-[6px] bg-red-50 border border-red-200 text-xs text-red-700">
                              {tplSaveError}
                            </div>
                          )}
                          <button onClick={createTemplate} disabled={savingTpl} className="w-full py-2.5 text-xs bg-brand-500 text-white rounded-[6px] hover:bg-brand-600 disabled:opacity-50 font-medium">{savingTpl ? 'Saving...' : 'Save Template & Assign to step'}</button>
                        </div>
                      ) : null}
                    />
                  ))}
                </div>
                <button
                  onClick={addStep}
                  className="mt-3 w-full py-2.5 text-xs rounded-[8px] border border-dashed border-surface-border text-grey-35 hover:bg-surface-light hover:text-grey-15 font-medium"
                >
                  + Add follow-up step
                </button>
              </div>

            </div>
            {saveError && <div className="mt-4 px-3 py-2 rounded-[8px] bg-red-50 border border-red-200 text-xs text-red-700">{saveError}</div>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim()} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save' : 'Create'}</button>
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

function firstStepDest(r: Rule): 'applicant' | 'company' | 'specific' {
  return (r.steps?.[0]?.emailDestination as 'applicant' | 'company' | 'specific') || (r.emailDestination as 'applicant' | 'company' | 'specific') || 'applicant'
}

/**
 * One step in the rule's sequence. Mirrors the per-rule modal that existed
 * pre-step refactor: channel toggle, body fields, destination, next-step
 * config. Step 0's delay is editable for all triggers except `before_meeting`,
 * where step 0 is anchored to the rule's `minutesBefore` setting.
 */
function StepCard(props: {
  step: StepShape
  idx: number
  total: number
  isFirst: boolean
  triggerType: string
  templates: Template[]
  trainings: TrainingItem[]
  schedulingConfigs: SchedulingItem[]
  companyEmail: string | null
  previewLoading: boolean
  onChange: (patch: Partial<StepShape>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onCompanyMissing: () => void
  onPreview: (channel?: 'email' | 'sms') => void
  onCreateDefaultDirect: (tpl: { name: string; subject: string; bodyHtml: string }) => Promise<string | null>
  onInsertTokenInTemplate: (templateId: string, kind: 'training' | 'scheduling' | 'meet_link', label: string) => Promise<boolean>
  onInsertTokenInSmsBody: (kind: 'training' | 'scheduling' | 'meet_link') => void
  onCreateTemplate: () => void
  onPickDefaultTemplate: (tpl: { name: string; subject: string; bodyHtml: string }) => void
  isEditingTemplate: boolean
  editorSlot: React.ReactNode
}) {
  const { step, idx, total, isFirst, triggerType, templates, trainings, schedulingConfigs, companyEmail } = props
  const wantsEmail = step.channel === 'email' || step.channel === 'both'
  const wantsSms = step.channel === 'sms' || step.channel === 'both'
  const delayLocked = isFirst && triggerType === 'before_meeting'
  const canPreviewEmail = wantsEmail && !!step.emailTemplateId
  const canPreviewSms = wantsSms && !!step.smsBody && step.smsBody.trim().length > 0

  return (
    <div className="border border-surface-border rounded-[10px] p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold">{idx + 1}</span>
          <span className="text-sm font-medium text-grey-15">{isFirst ? 'First step' : 'Follow-up'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={props.onMoveUp} disabled={idx === 0} className="text-xs px-2 py-1 rounded text-grey-40 hover:text-grey-15 disabled:opacity-30" title="Move up">↑</button>
          <button onClick={props.onMoveDown} disabled={idx === total - 1} className="text-xs px-2 py-1 rounded text-grey-40 hover:text-grey-15 disabled:opacity-30" title="Move down">↓</button>
          {total > 1 && <button onClick={props.onRemove} className="text-xs px-2 py-1 rounded text-red-500 hover:text-red-700" title="Remove step">×</button>}
        </div>
      </div>

      <div className="space-y-3">
        {/* Channel */}
        <div>
          <label className="block text-xs font-medium text-grey-20 mb-1.5">Channel</label>
          <div className="flex gap-2">
            {[
              { v: 'email' as const, l: 'Email' },
              { v: 'sms' as const, l: 'SMS' },
              { v: 'both' as const, l: 'Email + SMS' },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => {
                  // When the user switches to a channel that requires an SMS
                  // body, prefill it with a trigger-appropriate default if
                  // empty — the textarea's placeholder isn't real content.
                  const wantsSmsNow = v === 'sms' || v === 'both'
                  const smsEmpty = !step.smsBody || step.smsBody.trim().length === 0
                  if (wantsSmsNow && smsEmpty) {
                    props.onChange({ channel: v, smsBody: pickDefaultSmsBody(triggerType) })
                  } else {
                    props.onChange({ channel: v })
                  }
                }}
                className={`flex-1 py-2 text-xs rounded-[8px] border font-medium ${step.channel === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}
              >
                {l}
              </button>
            ))}
          </div>
          {step.channel === 'both' && (
            <p className="text-[11px] text-grey-40 mt-1.5">
              Sends both an email and an SMS at the same time. The candidate needs both an email and a phone number.
            </p>
          )}
        </div>

        {/* Delay + timing mode */}
        {!delayLocked && (() => {
          const isMeetingTrigger = MEETING_TRIGGERS.has(triggerType)
          const mode = step.timingMode || 'trigger'
          const delayLabel = mode === 'before_meeting' ? 'Minutes before meeting'
            : mode === 'after_meeting' ? 'Minutes after meeting'
            : 'Delay after trigger'
          const fireDescription = mode === 'before_meeting'
            ? `Fires ${formatDelay(step.delayMinutes)} BEFORE the candidate's scheduled meeting time.`
            : mode === 'after_meeting'
              ? `Fires ${formatDelay(step.delayMinutes)} AFTER the candidate's scheduled meeting time.`
              : `Fires ${formatDelay(step.delayMinutes)} after the trigger event.`
          return (
          <div>
            {/* Timing-mode picker — only meaningful when the trigger is meeting-related */}
            {isMeetingTrigger && (
              <div className="mb-2">
                <label className="block text-xs font-medium text-grey-20 mb-1.5">When to fire</label>
                <div className="flex gap-2">
                  {[
                    { v: 'trigger' as const, l: 'After trigger' },
                    { v: 'before_meeting' as const, l: 'Before meeting' },
                    { v: 'after_meeting' as const, l: 'After meeting' },
                  ].map(({ v, l }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => props.onChange({ timingMode: v })}
                      className={`flex-1 py-1.5 text-xs rounded-[8px] border font-medium ${mode === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="block text-xs font-medium text-grey-20 mb-1.5">{delayLabel}</label>
            <div className="flex flex-wrap gap-1.5">
              {DELAY_PRESETS.map(d => (
                <button key={d.value} onClick={() => props.onChange({ delayMinutes: d.value })} className={`px-3 py-1.5 text-xs rounded-[6px] border font-medium ${step.delayMinutes === d.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35 hover:bg-surface'}`}>
                  {d.label}
                </button>
              ))}
            </div>
            {!DELAY_PRESETS.some((d) => d.value === step.delayMinutes) && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number" min={0}
                  value={step.delayMinutes}
                  onChange={(e) => props.onChange({ delayMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-24 px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-xs text-grey-40">minutes</span>
              </div>
            )}
            {step.delayMinutes > 0 && <p className="text-xs text-grey-50 mt-1">{fireDescription}</p>}
          </div>
          )
        })()}
        {delayLocked && (
          <p className="text-xs text-grey-50">Step 1 of a before_meeting rule fires at the rule&apos;s &quot;X minutes before meeting&quot; setting (above).</p>
        )}

        {/* Email block */}
        {wantsEmail && (
          <div className="p-3 rounded-[8px] bg-blue-50/40 border border-blue-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Email</div>
              <button
                type="button"
                onClick={() => props.onPreview('email')}
                disabled={!canPreviewEmail || props.previewLoading}
                className="text-[11px] text-blue-700 hover:text-blue-900 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                title={!canPreviewEmail ? 'Pick a template first' : 'Preview rendered email'}
              >
                {props.previewLoading ? 'Loading…' : 'Preview email'}
              </button>
            </div>
            {props.isEditingTemplate ? (
              props.editorSlot
            ) : (
            <div>
              <label className="block text-xs text-grey-40 mb-1">Template</label>
              <select
                value={step.emailTemplateId || ''}
                onChange={async (e) => {
                  const value = e.target.value
                  // "default:<name>" → open the inline template editor with
                  // the default's content prefilled. The recruiter can edit
                  // before saving; the editor auto-suffixes the name if it
                  // collides with an existing workspace template.
                  if (value.startsWith('default:')) {
                    const name = value.slice('default:'.length)
                    const defTpl = DEFAULT_EMAIL_TEMPLATES.find((t) => t.name === name)
                    if (!defTpl) return
                    props.onPickDefaultTemplate(defTpl)
                    return
                  }
                  const id = value || null
                  // Auto-pick the matching "Includes link to" option from the
                  // template's tokens, but only when the recruiter hasn't set
                  // one explicitly. Manual selection always wins.
                  const newTpl = id ? templates.find((t) => t.id === id) : null
                  const detected = newTpl
                    ? detectLinkType([newTpl.subject || '', newTpl.bodyHtml || '', newTpl.bodyText || '', step.smsBody || ''].join(' '))
                    : null
                  props.onChange({
                    emailTemplateId: id,
                    ...(detected && !step.nextStepType ? { nextStepType: detected } : {}),
                  })
                }}
                className="w-full px-3 py-2 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select template...</option>
                {templates.length > 0 && (
                  <optgroup label="Saved templates">
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                )}
                {(() => {
                  const missing = DEFAULT_EMAIL_TEMPLATES.filter((d) => !templates.some((t) => t.name === d.name))
                  if (missing.length === 0) return null
                  return (
                    <optgroup label="Add a default (one-click)">
                      {missing.map((tpl) => (
                        <option key={tpl.name} value={`default:${tpl.name}`}>{tpl.name}</option>
                      ))}
                    </optgroup>
                  )
                })()}
              </select>
              {/* Inline preview of the selected template — subject line + first
                  ~140 chars of plain-text body. Lets the recruiter see exactly
                  what'll be sent without opening the full Preview modal. */}
              {(() => {
                const sel = templates.find((t) => t.id === step.emailTemplateId)
                if (!sel) return null
                const bodyText = (sel.bodyHtml || '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                return (
                  <div className="mt-2 p-2.5 bg-white border border-surface-border rounded-[6px] text-[11px] space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex gap-2"><span className="text-grey-40 w-12 flex-shrink-0">Subject</span><span className="text-grey-15 font-medium truncate">{sel.subject}</span></div>
                        {bodyText && <div className="flex gap-2"><span className="text-grey-40 w-12 flex-shrink-0">Body</span><span className="text-grey-35 line-clamp-2">{bodyText.slice(0, 200)}{bodyText.length > 200 ? '…' : ''}</span></div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => props.onPickDefaultTemplate({ name: sel.name, subject: sel.subject, bodyHtml: sel.bodyHtml || '' })}
                        className="text-[11px] text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap flex-shrink-0"
                        title={`Edit "${sel.name}" — saves as a new template (auto-suffixed if the name collides)`}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                )
              })()}
              <div className="flex flex-wrap gap-1 mt-1.5">
                <button onClick={props.onCreateTemplate} className="text-[11px] text-brand-600 hover:text-brand-700 font-medium">+ New template…</button>
                <span className="text-[11px] text-grey-40">or pick a default:</span>
                {DEFAULT_EMAIL_TEMPLATES.slice(0, 4).map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => props.onPickDefaultTemplate(tpl)}
                    className="text-[11px] text-grey-35 hover:text-brand-600 underline-offset-2 hover:underline"
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
            )}
            <div>
              <label className="block text-xs text-grey-40 mb-1">Send to</label>
              <div className="flex gap-2">
                {([
                  { v: 'applicant' as const, l: 'Applicant' },
                  { v: 'company' as const, l: 'Company' },
                  { v: 'specific' as const, l: 'Specific' },
                ]).map(({ v, l }) => (
                  <button
                    key={v}
                    onClick={() => {
                      if (v === 'company' && !companyEmail) { props.onCompanyMissing(); return }
                      props.onChange({ emailDestination: v })
                    }}
                    className={`flex-1 py-1.5 text-xs rounded-[8px] border font-medium ${step.emailDestination === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {step.emailDestination === 'specific' && (
                <input
                  type="email"
                  value={step.emailDestinationAddress || ''}
                  onChange={(e) => props.onChange({ emailDestinationAddress: e.target.value })}
                  placeholder="recipient@example.com"
                  className="mt-2 w-full px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              )}
              {step.emailDestination === 'company' && companyEmail && (
                <p className="text-[11px] text-grey-40 mt-1">Will send to <span className="font-medium text-grey-20">{companyEmail}</span>.</p>
              )}
            </div>
          </div>
        )}

        {/* SMS block */}
        {wantsSms && (
          <div className="p-3 rounded-[8px] bg-purple-50/40 border border-purple-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide">SMS</div>
              <button
                type="button"
                onClick={() => props.onPreview('sms')}
                disabled={!canPreviewSms || props.previewLoading}
                className="text-[11px] text-purple-700 hover:text-purple-900 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                title={!canPreviewSms ? 'Type an SMS body first' : 'Preview rendered SMS'}
              >
                {props.previewLoading ? 'Loading…' : 'Preview SMS'}
              </button>
            </div>
            <textarea
              value={step.smsBody || ''}
              onChange={(e) => {
                const body = e.target.value
                const detected = detectLinkType(body)
                props.onChange({
                  smsBody: body,
                  ...(detected && !step.nextStepType ? { nextStepType: detected } : {}),
                })
              }}
              rows={3}
              placeholder="Hi {{candidate_name}}, your interview starts at {{meeting_time}}. Join: {{meeting_link}}"
              className="w-full px-3 py-2 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-grey-40">
                Tokens: <code>{'{{candidate_name}}'}</code>, <code>{'{{meeting_time}}'}</code>, <code>{'{{meeting_link}}'}</code>, <code>{'{{schedule_link}}'}</code>.
              </p>
              <span className={`text-[11px] font-mono ${(step.smsBody?.length ?? 0) > 320 ? 'text-amber-700' : (step.smsBody?.length ?? 0) > 160 ? 'text-grey-15' : 'text-grey-40'}`}>
                {step.smsBody?.length ?? 0} chars · {Math.max(1, Math.ceil((step.smsBody?.length ?? 0) / 160))} seg
              </span>
            </div>
          </div>
        )}

        {/* Next-step config */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-grey-20">Includes link to</label>
            {(() => {
              if (!step.nextStepType || step.nextStepType === '') return null
              const tokenMap: Record<string, string> = {
                training: '{{training_link}}',
                scheduling: '{{schedule_link}}',
                meet_link: '{{meeting_link}}',
              }
              const expectedToken = tokenMap[step.nextStepType]
              if (!expectedToken) return null
              const tpl = step.emailTemplateId ? templates.find((t) => t.id === step.emailTemplateId) : null
              const labelMap: Record<string, string> = {
                training:   step.training?.title || trainings.find((t) => t.id === step.trainingId)?.title || 'Continue',
                scheduling: step.schedulingConfig?.name || schedulingConfigs.find((s) => s.id === step.schedulingConfigId)?.name || 'Book interview',
                meet_link:  'Join interview',
              }
              const ctaLabel = labelMap[step.nextStepType] || 'Continue'
              const emailHasToken = !wantsEmail || (tpl && (tpl.bodyHtml || '').includes(expectedToken))
              const smsHasToken = !wantsSms || (step.smsBody || '').includes(expectedToken)
              const emailNeedsInsert = wantsEmail && tpl && !(tpl.bodyHtml || '').includes(expectedToken)
              const smsNeedsInsert = wantsSms && !(step.smsBody || '').includes(expectedToken)
              // Already present everywhere it's needed — show a positive indicator
              // so the recruiter knows the link is in place (and explains why
              // there's no Insert button to click).
              if (!emailNeedsInsert && !smsNeedsInsert && (emailHasToken || smsHasToken)) {
                return (
                  <span
                    className="text-[11px] px-2.5 py-1 rounded-[6px] bg-green-50 text-green-700 border border-green-200 font-medium whitespace-nowrap"
                    title={`${expectedToken} is already in the ${wantsEmail && wantsSms ? 'template & SMS body' : wantsEmail ? 'template' : 'SMS body'}`}
                  >
                    ✓ Link in {wantsEmail && wantsSms ? 'template & SMS' : wantsEmail ? 'template' : 'SMS'}
                  </span>
                )
              }
              if (!emailNeedsInsert && !smsNeedsInsert) return null
              return (
                <button
                  type="button"
                  onClick={async () => {
                    if (emailNeedsInsert && tpl) {
                      await props.onInsertTokenInTemplate(tpl.id, step.nextStepType as 'training' | 'scheduling' | 'meet_link', ctaLabel)
                    }
                    if (smsNeedsInsert) {
                      props.onInsertTokenInSmsBody(step.nextStepType as 'training' | 'scheduling' | 'meet_link')
                    }
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-[6px] bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200 font-medium whitespace-nowrap"
                  title={emailNeedsInsert && smsNeedsInsert
                    ? `Insert ${expectedToken} into the template & SMS body`
                    : emailNeedsInsert
                      ? `Insert ${expectedToken} into "${tpl?.name}"`
                      : `Insert ${expectedToken} into the SMS body`}
                >
                  + Insert {expectedToken}
                </button>
              )
            })()}
          </div>
          <div className="flex gap-2">
            {[
              { v: '', l: 'Nothing' },
              { v: 'training', l: 'Training' },
              { v: 'scheduling', l: 'Scheduling' },
              { v: 'meet_link', l: 'Google Meet' },
            ].map(({ v, l }) => {
              const detected = detectStepLinkType(step, templates)
              const isSelected = (step.nextStepType || '') === v
              const isDetected = !step.nextStepType && v && detected === v
              return (
                <button
                  key={v || 'none'}
                  onClick={() => props.onChange({ nextStepType: v || null })}
                  className={`flex-1 py-1.5 text-xs rounded-[8px] border font-medium ${
                    isSelected ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : isDetected ? 'border-brand-300 bg-brand-50/40 text-brand-700'
                      : 'border-surface-border text-grey-35'
                  }`}
                  title={isDetected ? 'Auto-detected from template content' : undefined}
                >
                  {l}{isDetected ? ' ✦' : ''}
                </button>
              )
            })}
          </div>
          {(() => {
            const detected = detectStepLinkType(step, templates)
            if (!step.nextStepType && detected) {
              return <p className="text-[11px] text-brand-700/80 mt-1.5">✦ Detected <code>{detected === 'meet_link' ? '{{meeting_link}}' : detected === 'training' ? '{{training_link}}' : '{{schedule_link}}'}</code> in the template — click to confirm.</p>
            }
            // Mismatch warning: picker is set but the actual template/SMS body
            // doesn't use the corresponding merge token, so the link won't
            // appear in the rendered message.
            if (step.nextStepType) {
              const tokenMap: Record<string, string> = {
                training: '{{training_link}}',
                scheduling: '{{schedule_link}}',
                meet_link: '{{meeting_link}}',
              }
              const expectedToken = tokenMap[step.nextStepType]
              if (!expectedToken) return null
              const tpl = step.emailTemplateId ? templates.find((t) => t.id === step.emailTemplateId) : null
              const haystack = [tpl?.subject || '', tpl?.bodyHtml || '', tpl?.bodyText || '', step.smsBody || ''].join(' ')
              if (haystack && !haystack.includes(expectedToken)) {
                return (
                  <div className="mt-2 px-2.5 py-2 rounded-[6px] bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                    ⚠ The selected {wantsEmail && wantsSms ? 'template / SMS body' : wantsEmail ? 'template' : 'SMS body'} doesn&apos;t include <code className="bg-white px-1 rounded">{expectedToken}</code> — the link won&apos;t appear in the rendered message. Add <code className="bg-white px-1 rounded">{expectedToken}</code> to your {wantsEmail ? 'template body' : 'SMS body'} where you want the link to appear.
                  </div>
                )
              }
            }
            return null
          })()}
          {step.nextStepType === 'training' && (
            <div className="mt-2">
              <select value={step.trainingId || ''} onChange={(e) => props.onChange({ trainingId: e.target.value || null })} className="w-full px-3 py-2 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">Select training...</option>
                {trainings.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <p className="text-[11px] text-grey-40 mt-1">A unique access token is generated per candidate. {'{{training_link}}'} renders the personalized URL.</p>
            </div>
          )}
          {step.nextStepType === 'scheduling' && (
            <div className="mt-2">
              <select value={step.schedulingConfigId || ''} onChange={(e) => props.onChange({ schedulingConfigId: e.target.value || null })} className="w-full px-3 py-2 border border-surface-border rounded-[8px] text-grey-15 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">Use default link</option>
                {schedulingConfigs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="text-[11px] text-grey-40 mt-1">{'{{schedule_link}}'} renders the tracked redirect URL. Candidate moves to &quot;invited to schedule&quot; when this step succeeds.</p>
            </div>
          )}
          {step.nextStepType === 'meet_link' && (
            <p className="text-[11px] text-grey-40 mt-2">
              {'{{meeting_link}}'} renders the candidate&apos;s scheduled Meet URL — populated automatically from the InterviewMeeting row when the meeting is created (in-app scheduler or Calendly adoption). No additional configuration needed.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Two-row pipeline view — applicant journey on top, company notifications
 * below.
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
      const dest = firstStepDest(r)
      const bucketKey = dest === 'applicant' ? 'applicant' : 'company'
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
      {row('applicant', 'Applicant journey', 'Messages sent to the candidate as they move through the pipeline')}
      {row('company', 'Company notifications', 'Notifications sent to your team or a specific inbox')}
    </div>
  )
}
