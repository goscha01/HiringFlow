'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DEFAULT_FUNNEL_STAGES,
  type FunnelStage,
  normalizeStages,
  resolveStage,
} from '@/lib/funnel-stages'
import { InterviewPanel } from './_InterviewPanel'
import { NotesPanel } from './_NotesPanel'
import { CurrentActivityCard } from './_CurrentActivityCard'
import { BackgroundCheckCard } from './_BackgroundCheckCard'

interface Answer {
  id: string; answeredAt: string
  step: { id: string; title: string; questionText: string | null; stepType: string; questionType: string }
  option: { id: string; optionText: string } | null
}
interface Submission {
  id: string; submittedAt: string; videoStorageKey: string | null; videoFilename: string | null; textMessage: string | null
  step: { id: string; title: string; questionText: string | null }
}
interface TrainingSection {
  id: string; title: string; sortOrder: number; kind: string
  contents?: { id: string; type: string }[]
}
interface TrainingEnrollment {
  id: string; status: string; startedAt: string; completedAt: string | null
  progress: {
    completedSections?: string[]
    quizScores?: { sectionId: string; score: number }[]
    sectionTimestamps?: Record<string, string>
    currentLesson?: { sectionId: string; lessonIdx: number; at: string }
  } | null
  training: { id: string; title: string; sections?: TrainingSection[] }
}
interface SchedulingEvent { id: string; eventType: string; eventAt: string; metadata: Record<string, any> | null }
interface AutomationExec {
  id: string; status: string; errorMessage: string | null; sentAt: string | null; scheduledFor: string | null; createdAt: string
  channel: string
  automationRule: {
    id: string; name: string; triggerType: string
    chainedBy: { id: string; name: string; steps: { delayMinutes: number }[] }[]
  }
  step: {
    id: string; order: number; channel: string; delayMinutes: number
    nextStepType: string | null
    emailDestination: string; emailDestinationAddress: string | null
    training: { title: string; slug: string } | null
    schedulingConfig: { name: string; schedulingUrl: string } | null
    emailTemplate: { name: string; subject: string } | null
  } | null
}
interface CandidateDetail {
  id: string; candidateName: string | null; candidateEmail: string | null; candidatePhone: string | null
  formData: Record<string, string> | null; outcome: string | null; pipelineStatus: string | null
  startedAt: string; finishedAt: string | null
  // `lastActivityAt` is the raw heartbeat column. `effectiveLastActivityAt`
  // is the server-computed max across that column + every event timestamp
  // (meeting actualStart/End, scheduling events, training section stamps,
  // answers, submissions). Always prefer the effective value for the UI —
  // existing candidates predate the heartbeat column.
  lastActivityAt: string | null
  effectiveLastActivityAt: string | null
  source: string | null; campaign: string | null
  rejectionReason: string | null; rejectionReasonAt: string | null
  flow: { id: string; name: string; slug: string } | null
  lastStep: { id: string; title: string; stepOrder: number; stepType: string; questionType: string } | null
  flowStepCount: number
  ad: { id: string; name: string; source: string } | null
  answers: Answer[]; submissions: Submission[]
  trainingEnrollments: TrainingEnrollment[]; schedulingEvents: SchedulingEvent[]
  automationExecutions?: AutomationExec[]
  formFieldLabels?: Record<string, string>
  isRebook?: boolean
}

const REJECTION_PRESETS = ['No-show', 'Not qualified', 'Wrong schedule', 'Declined offer', 'Wrong location', 'Pay expectations']

function normalizeCustomReasons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set(REJECTION_PRESETS.map((p) => p.toLowerCase()))
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

export default function CandidateDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'answers' | 'submissions' | 'timeline'>('answers')
  const [deleting, setDeleting] = useState(false)
  const [stages, setStages] = useState<FunnelStage[]>(DEFAULT_FUNNEL_STAGES)
  const [customReasons, setCustomReasons] = useState<string[]>([])
  const [stageRuleCounts, setStageRuleCounts] = useState<Record<string, number>>({})
  const [runningAutomations, setRunningAutomations] = useState(false)
  const [automationToast, setAutomationToast] = useState<string | null>(null)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [reminderToast, setReminderToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // Set when the user clicks "Run automations". Holds the rules that *would*
  // fire so we can show them in a confirm modal before actually dispatching.
  // null when the modal is closed; the array can be empty if loading or none match.
  const [previewState, setPreviewState] = useState<null | {
    loading: boolean
    rules: Array<{ id: string; name: string; triggerType: string }>
    error?: string
  }>(null)

  useEffect(() => {
    fetch(`/api/candidates/${id}`).then(r => r.json()).then(d => { setCandidate(d); setLoading(false) })
  }, [id])

  useEffect(() => {
    fetch('/api/workspace/settings')
      .then((r) => r.json())
      .then((d) => {
        const settings = (d?.settings as { funnelStages?: unknown; customRejectionReasons?: unknown } | null) ?? null
        setStages(normalizeStages(settings?.funnelStages))
        setCustomReasons(normalizeCustomReasons(settings?.customRejectionReasons))
      })
      .catch(() => {})
  }, [])

  // Active rule counts per stage. A rule matches a stage if its stageId is
  // explicitly set to that stage OR (stageId is null AND its triggerType is
  // one of the stage's trigger events). Mirrors the server-side matcher in
  // /api/candidates/[id]/run-stage-automations so the count and the actual
  // run agree.
  useEffect(() => {
    if (!candidate?.flow?.id) return
    fetch('/api/automations')
      .then((r) => r.json())
      .then((rules: Array<{ id: string; isActive: boolean; triggerType: string; flowId: string | null; stageId: string | null }>) => {
        const candidateFlowId = candidate.flow!.id
        const counts: Record<string, number> = {}
        for (const stage of stages) {
          const events = new Set((stage.triggers ?? []).map((t) => t.event))
          counts[stage.id] = rules.filter((r) => {
            if (!r.isActive) return false
            if (r.flowId !== null && r.flowId !== candidateFlowId) return false
            if (r.stageId === stage.id) return true
            if (r.stageId === null && events.has(r.triggerType as never)) return true
            return false
          }).length
        }
        setStageRuleCounts(counts)
      })
      .catch(() => {})
  }, [stages, candidate?.flow?.id])

  const updateStatus = async (pipelineStatus: string) => {
    await fetch(`/api/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineStatus }),
    })
    setCandidate(prev => prev ? { ...prev, pipelineStatus } : null)
  }

  const updateOutcome = async (outcome: string) => {
    await fetch(`/api/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, pipelineStatus: outcome === 'passed' ? 'passed' : outcome === 'failed' ? 'failed' : undefined }),
    })
    setCandidate(prev => prev ? { ...prev, outcome, ...(outcome === 'passed' ? { pipelineStatus: 'passed' } : outcome === 'failed' ? { pipelineStatus: 'failed' } : {}) } : null)
  }

  const deleteCandidate = async () => {
    if (!candidate) return
    const name = candidate.candidateName || candidate.candidateEmail || 'this candidate'
    if (!confirm(`Delete ${name}? This permanently removes their answers, video submissions, training progress, and scheduled interviews. This cannot be undone.`)) return
    setDeleting(true)
    const res = await fetch(`/api/candidates/${id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/dashboard/candidates')
    } else {
      setDeleting(false)
      alert('Failed to delete candidate')
    }
  }

  const [showReasonEditor, setShowReasonEditor] = useState(false)
  const [reasonDraft, setReasonDraft] = useState('')
  const openReasonEditor = () => {
    setReasonDraft(candidate?.rejectionReason ?? '')
    setShowReasonEditor(true)
  }
  const persistCustomReasons = async (next: string[]) => {
    setCustomReasons(next)
    try {
      const getRes = await fetch('/api/workspace/settings', { credentials: 'same-origin' })
      const current = getRes.ok ? (await getRes.json())?.settings : null
      const merged = { ...(current && typeof current === 'object' ? current : {}), customRejectionReasons: next }
      await fetch('/api/workspace/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ settings: merged }),
      })
    } catch { /* non-blocking; the candidate save already succeeded */ }
  }
  const saveReason = async (next: string) => {
    const trimmed = next.trim()
    const res = await fetch(`/api/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectionReason: trimmed }),
    })
    if (res.ok) {
      const data = await res.json()
      setCandidate(prev => prev ? { ...prev, rejectionReason: data.rejectionReason ?? null, rejectionReasonAt: data.rejectionReasonAt ?? null } : null)
      setShowReasonEditor(false)
      // If this is a brand-new reason (not a default and not already saved), append it
      // to the workspace's reusable list so it shows up as a quick-pick next time.
      if (trimmed) {
        const lc = trimmed.toLowerCase()
        const isDefault = REJECTION_PRESETS.some((p) => p.toLowerCase() === lc)
        const isKnown = customReasons.some((p) => p.toLowerCase() === lc)
        if (!isDefault && !isKnown) {
          await persistCustomReasons([...customReasons, trimmed])
        }
      }
    }
  }
  const removeCustomReason = (reason: string) => {
    const next = customReasons.filter((r) => r !== reason)
    persistCustomReasons(next)
  }
  const clearReason = () => saveReason('')

  const [showLogMeeting, setShowLogMeeting] = useState(false)
  const [meetingAt, setMeetingAt] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [meetingNotes, setMeetingNotes] = useState('')
  const [savingMeeting, setSavingMeeting] = useState(false)

  const sendMeetingReminder = async () => {
    if (sendingReminder) return
    if (!confirm('Send the "we\'re waiting for you" nudge to this candidate now? Email goes out immediately, plus SMS if a phone number is on file.')) return
    setSendingReminder(true)
    setReminderToast(null)
    try {
      const res = await fetch(`/api/candidates/${id}/send-meeting-reminder`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setReminderToast({ kind: 'err', text: data?.error || 'Failed to send reminder' })
        return
      }
      const emailOk = data?.email?.success
      const smsOk = data?.sms?.success
      const channels: string[] = []
      if (emailOk) channels.push('email')
      if (smsOk) channels.push('SMS')
      const failures: string[] = []
      if (data?.email && !emailOk) failures.push(`email (${data.email.error || 'failed'})`)
      if (data?.sms && !smsOk) failures.push(`SMS (${data.sms.error || 'failed'})`)
      if (channels.length > 0 && failures.length === 0) {
        setReminderToast({ kind: 'ok', text: `Sent ${channels.join(' and ')} nudge.` })
      } else if (channels.length > 0 && failures.length > 0) {
        setReminderToast({ kind: 'err', text: `Sent ${channels.join(' and ')}, but ${failures.join(', ')} failed.` })
      } else {
        setReminderToast({ kind: 'err', text: failures.length ? `Failed: ${failures.join(', ')}` : 'Nothing was sent.' })
      }
      fetch(`/api/candidates/${id}`).then((r) => r.json()).then(setCandidate).catch(() => {})
    } catch (err) {
      setReminderToast({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to send reminder' })
    } finally {
      setSendingReminder(false)
      setTimeout(() => setReminderToast(null), 6000)
    }
  }

  const logMeeting = async () => {
    if (!meetingAt) return
    setSavingMeeting(true)
    const res = await fetch(`/api/candidates/${id}/schedule-meeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheduledAt: new Date(meetingAt).toISOString(),
        meetingUrl: meetingUrl || undefined,
        notes: meetingNotes || undefined,
      }),
    })
    setSavingMeeting(false)
    if (res.ok) {
      setShowLogMeeting(false)
      setMeetingAt(''); setMeetingUrl(''); setMeetingNotes('')
      // Refresh candidate data
      fetch(`/api/candidates/${id}`).then(r => r.json()).then(d => setCandidate(d))
    } else {
      alert('Failed to log meeting')
    }
  }

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>
  if (!candidate) return <div className="text-center py-12 text-grey-40">Candidate not found</div>

  const activeStage = resolveStage(candidate.pipelineStatus, stages)
  const activeStageRuleCount = stageRuleCounts[activeStage.id] ?? 0
  const activeStageHasTriggers = (activeStage.triggers?.length ?? 0) > 0

  // Open the preview modal — fetch the exact rules that would fire so the
  // user can see by name what's about to run before confirming.
  const openPreview = async () => {
    if (runningAutomations || activeStageRuleCount === 0) return
    setPreviewState({ loading: true, rules: [] })
    try {
      const res = await fetch(`/api/candidates/${id}/run-stage-automations?stageId=${encodeURIComponent(activeStage.id)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load matching automations')
      setPreviewState({ loading: false, rules: data.rules ?? [] })
    } catch (err) {
      setPreviewState({
        loading: false,
        rules: [],
        error: err instanceof Error ? err.message : 'Failed to load matching automations',
      })
    }
  }

  const runStageAutomations = async () => {
    if (runningAutomations) return
    setRunningAutomations(true)
    setAutomationToast(null)
    try {
      const res = await fetch(`/api/candidates/${id}/run-stage-automations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: activeStage.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to fire automations')
      const fired: number = data.fired ?? 0
      const failed = (data.results || []).filter((r: { ok: boolean }) => !r.ok).length
      setAutomationToast(
        failed > 0
          ? `Fired ${fired}, ${failed} failed — see timeline for details.`
          : `Fired ${fired} automation${fired === 1 ? '' : 's'}.`,
      )
      fetch(`/api/candidates/${id}`).then((r) => r.json()).then(setCandidate).catch(() => {})
      setPreviewState(null)
    } catch (err) {
      setAutomationToast(err instanceof Error ? err.message : 'Failed to fire automations')
    } finally {
      setRunningAutomations(false)
      setTimeout(() => setAutomationToast(null), 6000)
    }
  }

  const triggerLabels: Record<string, string> = {
    flow_passed:        'Flow passed',
    flow_completed:     'Flow completed',
    training_started:   'Training started',
    training_completed: 'Training completed',
    meeting_scheduled:  'Interview scheduled',
    meeting_started:    'Interview started',
    meeting_ended:      'Interview ended',
    meeting_no_show:    'Interview no-show',
    before_meeting:     'Before meeting',
    automation_completed: 'After automation',
  }

  // Most recent scheduling event with a meeting URL (schedulingEvents is
  // returned newest-first by the API). Used for the "Meeting" info card.
  const latestMeeting = candidate.schedulingEvents.find(e => {
    const url = (e.metadata as Record<string, unknown> | null)?.meetingUrl
    return typeof url === 'string' && url.length > 0
  })
  const latestMeetingUrl = latestMeeting ? String((latestMeeting.metadata as Record<string, any>).meetingUrl) : null
  const latestMeetingAt = latestMeeting ? String((latestMeeting.metadata as Record<string, any>).scheduledAt || latestMeeting.eventAt) : null

  // Build timeline events
  const timeline: { label: string; time: string; type: string; detail?: string }[] = []
  timeline.push({ label: 'Applied / Flow started', time: candidate.startedAt, type: 'start' })
  if (candidate.finishedAt) timeline.push({ label: `Flow ${candidate.outcome || 'completed'}`, time: candidate.finishedAt, type: candidate.outcome === 'passed' ? 'success' : candidate.outcome === 'failed' ? 'error' : 'info' })
  candidate.trainingEnrollments.forEach(e => {
    timeline.push({ label: `Training started: ${e.training.title}`, time: e.startedAt, type: 'info' })
    // Per-section completion events — only enrollments saved after the
    // sectionTimestamps shape was introduced will have these. Older
    // enrollments fall through silently.
    const stamps = e.progress?.sectionTimestamps || {}
    const sections = e.training.sections || []
    const sectionById = new Map(sections.map((s) => [s.id, s] as const))
    for (const [sectionId, at] of Object.entries(stamps)) {
      const section = sectionById.get(sectionId)
      if (!section) continue
      timeline.push({
        label: `Training section completed: ${section.title}`,
        detail: e.training.title,
        time: at,
        type: 'info',
      })
    }
    if (e.completedAt) timeline.push({ label: `Training completed: ${e.training.title}`, time: e.completedAt, type: 'success' })
  })
  candidate.schedulingEvents.forEach(e => {
    const labels: Record<string, string> = {
      invite_sent: 'Scheduling invite sent',
      link_clicked: 'Scheduling link clicked',
      marked_scheduled: 'Marked as scheduled',
      meeting_scheduled: 'Meeting scheduled',
      meeting_rescheduled: 'Meeting rescheduled',
      meeting_cancelled: 'Meeting cancelled',
      meeting_confirmed: 'Candidate confirmed via SMS',
      meeting_no_show: 'Candidate no-show',
      nudge_sent: 'Manual "join now" nudge sent',
    }
    const successTypes = new Set(['marked_scheduled', 'meeting_scheduled', 'meeting_rescheduled', 'meeting_confirmed', 'nudge_sent'])
    const errorTypes = new Set(['meeting_cancelled', 'meeting_no_show'])
    const type = errorTypes.has(e.eventType) ? 'error' : successTypes.has(e.eventType) ? 'success' : 'info'
    const meta = e.metadata || {}
    const bits: string[] = []
    if (meta.scheduledAt) bits.push(`When: ${new Date(meta.scheduledAt).toLocaleString()}`)
    if (meta.meetingUrl) bits.push(`Link: ${meta.meetingUrl}`)
    if (meta.notes) bits.push(`Notes: ${meta.notes}`)
    if (e.eventType === 'nudge_sent') {
      const channels: string[] = []
      if (meta.emailOk) channels.push('email')
      if (meta.smsOk) channels.push('SMS')
      if (channels.length > 0) bits.push(`Channels: ${channels.join(' + ')}`)
    }
    timeline.push({ label: labels[e.eventType] || e.eventType, time: e.eventAt, type, detail: bits.join(' · ') || undefined })
  })
  ;(candidate.automationExecutions || []).forEach(e => {
    const r = e.automationRule
    const s = e.step
    const destLabel = s?.emailDestination === 'company' ? 'Company'
      : s?.emailDestination === 'specific' ? (s?.emailDestinationAddress || 'Specific')
      : 'Applicant'
    const chainSummary = (c: { name: string; steps: { delayMinutes: number }[] }) => {
      const firstDelay = c.steps[0]?.delayMinutes ?? 0
      return c.name + (firstDelay ? ` (+${firstDelay}m)` : '')
    }
    const nextStep = s?.nextStepType === 'training' && s?.training ? `Training — ${s.training.title}`
      : s?.nextStepType === 'scheduling' && s?.schedulingConfig ? `Scheduling — ${s.schedulingConfig.name}`
      : r.chainedBy.length > 0 ? `Chains to → ${r.chainedBy.map(chainSummary).join(', ')}`
      : s?.nextStepType === 'email' ? 'Send email only'
      : 'No follow-up'
    const stepDelay = s?.delayMinutes ?? 0
    const delayStr = stepDelay > 0
      ? (stepDelay >= 1440 ? `${Math.round(stepDelay / 1440)}d` : stepDelay >= 60 ? `${Math.round(stepDelay / 60)}h` : `${stepDelay}m`)
      : null
    const sentChannel = e.channel || s?.channel || 'email'
    const channelLabel = sentChannel === 'sms' ? 'SMS' : 'Email'
    const bits = [
      `Channel: ${channelLabel}`,
      sentChannel === 'email' ? `To: ${destLabel}` : null,
      sentChannel === 'email' && s?.emailTemplate ? `Template: ${s.emailTemplate.name}` : null,
      `Next step: ${nextStep}`,
      delayStr ? `Delay: ${delayStr}` : null,
      s && s.order > 0 ? `Step ${s.order + 1}` : null,
    ].filter(Boolean).join(' · ')
    const base = `Automation: ${r.name}`
    const sendVerb = sentChannel === 'sms' ? 'SMS sent' : 'email sent'
    if (e.status === 'sent') {
      timeline.push({ label: `${base} — ${sendVerb}`, detail: bits, time: e.sentAt || e.createdAt, type: 'success' })
    } else if (e.status === 'failed') {
      timeline.push({ label: `${base} — failed${e.errorMessage ? `: ${e.errorMessage}` : ''}`, detail: bits, time: e.createdAt, type: 'error' })
    } else if (e.status === 'queued' && e.scheduledFor) {
      timeline.push({ label: `${base} — scheduled`, detail: `${bits} · Fires at ${new Date(e.scheduledFor).toLocaleString()}`, time: e.scheduledFor, type: 'scheduled' })
    } else if (e.status === 'cancelled') {
      timeline.push({ label: `${base} — cancelled`, detail: bits, time: e.createdAt, type: 'info' })
    } else {
      timeline.push({ label: `${base} — pending`, detail: bits, time: e.createdAt, type: 'info' })
    }
  })
  timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  return (
    <div>
      {/* Back + Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/candidates" className="text-grey-40 hover:text-grey-15">&larr; Back</Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-grey-15">{candidate.candidateName || 'Anonymous'}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-grey-40">
            {candidate.candidateEmail && <span>{candidate.candidateEmail}</span>}
            {candidate.candidatePhone && <span>{candidate.candidatePhone}</span>}
            {candidate.flow && <span>Flow: {candidate.flow.name}</span>}
            {candidate.rejectionReason ? (
              <button
                onClick={openReasonEditor}
                title="Click to edit rejection reason"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200"
              >
                <span className="opacity-70">Reason:</span> {candidate.rejectionReason}
              </button>
            ) : (candidate.pipelineStatus === 'rejected' || candidate.pipelineStatus === 'failed' || candidate.outcome === 'failed') && (
              <button
                onClick={openReasonEditor}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-medium border border-dashed border-red-300 hover:bg-red-100"
              >
                + Add reason
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rejection reason editor */}
      {showReasonEditor && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onClick={() => setShowReasonEditor(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-[460px] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-grey-15 mb-1">Rejection reason</h3>
            <p className="text-xs text-grey-40 mb-4">Pick one or write your own. Stored on the candidate and visible across the dashboard.</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {REJECTION_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setReasonDraft(p)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium ${reasonDraft === p ? 'border-red-500 bg-red-50 text-red-700' : 'border-surface-border text-grey-35 hover:border-grey-35'}`}
                >
                  {p}
                </button>
              ))}
              {customReasons.map((p) => (
                <span
                  key={p}
                  className={`group inline-flex items-center gap-1 text-xs pl-3 pr-1 py-1.5 rounded-full border font-medium ${reasonDraft === p ? 'border-red-500 bg-red-50 text-red-700' : 'border-surface-border text-grey-35 hover:border-grey-35'}`}
                >
                  <button onClick={() => setReasonDraft(p)}>{p}</button>
                  <button
                    onClick={() => removeCustomReason(p)}
                    title="Remove from saved reasons"
                    className="w-4 h-4 flex items-center justify-center rounded-full text-grey-50 hover:bg-red-100 hover:text-red-700 text-[11px] leading-none"
                    aria-label={`Remove ${p}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const t = reasonDraft.trim()
                    if (!t) return
                    const lc = t.toLowerCase()
                    const known = REJECTION_PRESETS.some((p) => p.toLowerCase() === lc) || customReasons.some((p) => p.toLowerCase() === lc)
                    if (!known) persistCustomReasons([...customReasons, t])
                  }
                }}
                placeholder="Type a new reason and press + to save it"
                className="flex-1 px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                autoFocus
              />
              {(() => {
                const t = reasonDraft.trim()
                const lc = t.toLowerCase()
                const isKnown = !t || REJECTION_PRESETS.some((p) => p.toLowerCase() === lc) || customReasons.some((p) => p.toLowerCase() === lc)
                return (
                  <button
                    onClick={() => { if (!isKnown) persistCustomReasons([...customReasons, t]) }}
                    disabled={isKnown}
                    title={isKnown ? 'Already in the list' : 'Save as a reusable preset'}
                    className="px-3 rounded-[8px] border border-surface-border text-grey-35 hover:border-grey-35 disabled:opacity-40 disabled:hover:border-surface-border text-lg leading-none"
                    aria-label="Add reason to presets"
                  >
                    +
                  </button>
                )
              })()}
            </div>
            <p className="mt-2 text-[11px] text-grey-40">Saved presets appear as quick-picks for every candidate.</p>
            <div className="flex justify-between mt-5 gap-2">
              <button
                onClick={clearReason}
                disabled={!candidate.rejectionReason}
                className="text-xs px-3 py-1.5 rounded-[8px] text-grey-40 hover:text-grey-15 disabled:opacity-40"
              >
                Clear reason
              </button>
              <div className="flex gap-2">
                <button onClick={() => setShowReasonEditor(false)} className="text-sm px-4 py-2 rounded-[8px] text-grey-40 hover:text-grey-15">Cancel</button>
                <button
                  onClick={() => saveReason(reasonDraft)}
                  disabled={!reasonDraft.trim()}
                  className="text-sm px-4 py-2 rounded-[8px] bg-red-600 text-white hover:bg-red-700 font-medium disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current activity — at-a-glance "where is the candidate right now"
          panel. Sits above the pipeline so recruiters scanning the page
          see live progress before historical state. */}
      <CurrentActivityCard
        startedAt={candidate.startedAt}
        finishedAt={candidate.finishedAt}
        lastActivityAt={candidate.effectiveLastActivityAt ?? candidate.lastActivityAt}
        outcome={candidate.outcome}
        lastStep={candidate.lastStep}
        flowStepCount={candidate.flowStepCount}
        answersCount={candidate.answers.length}
        trainingEnrollments={candidate.trainingEnrollments}
      />

      {/* Pipeline progress */}
      <div className="bg-white rounded-[12px] border border-surface-border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-grey-15">Pipeline</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowLogMeeting(true)} className="text-xs px-3 py-1.5 rounded-[6px] bg-purple-100 text-purple-700 hover:bg-purple-200 font-medium">Log meeting</button>
            <button
              onClick={sendMeetingReminder}
              disabled={sendingReminder}
              title="Fire all active before-meeting reminder rules for this candidate now"
              className="text-xs px-3 py-1.5 rounded-[6px] bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium disabled:opacity-50"
            >
              {sendingReminder ? 'Sending…' : 'Send reminder'}
            </button>
            {candidate.outcome !== 'passed' && (
              <button onClick={() => updateOutcome('passed')} className="text-xs px-3 py-1.5 rounded-[6px] bg-green-100 text-green-700 hover:bg-green-200 font-medium">Pass</button>
            )}
            {candidate.outcome !== 'failed' && (
              <button onClick={() => updateOutcome('failed')} className="text-xs px-3 py-1.5 rounded-[6px] bg-red-100 text-red-700 hover:bg-red-200 font-medium">Fail</button>
            )}
            <button
              onClick={deleteCandidate}
              disabled={deleting}
              className="text-xs px-3 py-1.5 rounded-[6px] bg-red-600 text-white hover:bg-red-700 font-medium disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
        {/* Stage pills mirror the kanban — one click moves the candidate
            to that stage immediately. */}
        <div className="flex gap-1 flex-wrap">
          {stages.map((stage) => {
            const isActive = stage.id === activeStage.id
            const isPast = stage.order < activeStage.order
            return (
              <button
                key={stage.id}
                onClick={() => { if (!isActive) updateStatus(stage.id) }}
                title={isActive ? 'Current stage' : `Move to "${stage.label}"`}
                className={`flex-1 min-w-[110px] py-2.5 text-xs font-medium rounded-[6px] transition-colors border ${
                  isActive
                    ? 'bg-brand-500 text-white border-brand-500'
                    : isPast
                    ? 'bg-brand-100 text-brand-700 border-transparent hover:bg-brand-200'
                    : 'bg-surface text-grey-40 hover:bg-surface-light border-transparent'
                }`}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: isActive ? 'rgba(255,255,255,0.85)' : stage.color }}
                  />
                  {stage.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* Run automations targets the candidate's current stage. Disabled
            when the active stage has no triggers or no matching active rules. */}
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-grey-40">
            Current: <span className="font-medium text-grey-15">{activeStage.label}</span>
          </div>
          <button
            onClick={openPreview}
            disabled={activeStageRuleCount === 0 || runningAutomations}
            title={
              activeStageRuleCount === 0
                ? (activeStageHasTriggers
                    ? 'No active automations match this stage’s triggers.'
                    : 'No automations are pinned to this stage. Pin one from the rule editor (Pipeline stage field) or add a trigger to the stage.')
                : 'Preview which automations will fire, then confirm'
            }
            className="text-xs px-3 py-1.5 rounded-[6px] bg-brand-500 text-white hover:bg-brand-600 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {runningAutomations ? 'Firing…' : `Run automations${activeStageRuleCount > 0 ? ` (${activeStageRuleCount})` : ''}`}
          </button>
        </div>
        {automationToast && (
          <div className="mt-2 text-xs px-3 py-2 rounded-[6px] bg-brand-50 text-brand-700 border border-brand-100">
            {automationToast}
          </div>
        )}
        {reminderToast && (
          <div className={`mt-2 text-xs px-3 py-2 rounded-[6px] border ${
            reminderToast.kind === 'ok'
              ? 'bg-blue-50 text-blue-700 border-blue-100'
              : 'bg-red-50 text-red-700 border-red-100'
          }`}>
            {reminderToast.text}
          </div>
        )}
      </div>

      {/* Info cards */}
      <div className={`grid grid-cols-2 ${latestMeetingUrl ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3 mb-6`}>
        <div className="bg-white rounded-[8px] border border-surface-border p-4">
          <div className="text-xs text-grey-40 mb-1">Source</div>
          <div className="text-sm font-medium text-grey-15 capitalize">{candidate.ad?.source || candidate.source || 'Direct'}</div>
          {candidate.ad && <div className="text-xs text-grey-40 mt-0.5 truncate" title={candidate.ad.name}>{candidate.ad.name}</div>}
          {candidate.campaign && (
            <div className="text-xs text-grey-40 mt-0.5 truncate" title={candidate.campaign}>
              <span className="text-grey-50">Campaign:</span> {candidate.campaign}
            </div>
          )}
        </div>
        <div className="bg-white rounded-[8px] border border-surface-border p-4">
          <div className="text-xs text-grey-40 mb-1">Outcome</div>
          <div className={`text-sm font-medium ${candidate.outcome === 'passed' ? 'text-green-700' : candidate.outcome === 'failed' ? 'text-red-600' : 'text-grey-15'}`}>
            {candidate.outcome ? candidate.outcome.charAt(0).toUpperCase() + candidate.outcome.slice(1) : 'In progress'}
          </div>
        </div>
        {latestMeetingUrl && (
          <div className="bg-white rounded-[8px] border border-surface-border p-4">
            <div className="text-xs text-grey-40 mb-1">Meeting</div>
            <a
              href={latestMeetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand-600 hover:underline truncate block"
              title={latestMeetingUrl}
            >
              Open meeting link
            </a>
            {latestMeetingAt && (
              <div className="text-xs text-grey-40 mt-0.5">{new Date(latestMeetingAt).toLocaleString()}</div>
            )}
          </div>
        )}
        <div className="bg-white rounded-[8px] border border-surface-border p-4">
          <div className="text-xs text-grey-40 mb-1">Answers</div>
          <div className="text-sm font-medium text-grey-15">{candidate.answers.length}</div>
        </div>
        <div className="bg-white rounded-[8px] border border-surface-border p-4">
          <div className="text-xs text-grey-40 mb-1">Video Submissions</div>
          <div className="text-sm font-medium text-grey-15">{candidate.submissions.filter(s => s.videoStorageKey).length}</div>
        </div>
      </div>

      {/* Meet integration v2: in-app Google Meet scheduling (loosely coupled —
          the panel self-hides if the feature flag / scopes aren't active, so
          this never affects workspaces still on the Calendly flow) */}
      <InterviewPanel candidateId={id} candidateEmail={candidate.candidateEmail} isRebook={candidate.isRebook} />

      {/* Background check — Certn integration; self-hides gracefully if the
          workspace hasn't connected Certn yet (the order button just returns
          a friendly config error). */}
      <div className="mb-6">
        <BackgroundCheckCard sessionId={id} />
      </div>

      {/* Internal notes — recruiter-only, not shown to the candidate */}
      <NotesPanel candidateId={id} />

      {/* Form data */}
      {candidate.formData && Object.keys(candidate.formData).length > 0 && (
        <div className="bg-white rounded-[12px] border border-surface-border p-6 mb-6">
          <h3 className="text-sm font-semibold text-grey-15 mb-3">Form Data</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(candidate.formData).map(([key, value]) => {
              const builtInLabels: Record<string, string> = { name: 'Full Name', email: 'Email', phone: 'Phone' }
              const label = candidate.formFieldLabels?.[key] || builtInLabels[key] || key
              return (
                <div key={key}>
                  <div className="text-xs text-grey-40">{label}</div>
                  <div className="text-sm text-grey-15">{String(value)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-surface-border">
        {[
          { key: 'answers' as const, label: `Answers (${candidate.answers.length})` },
          { key: 'submissions' as const, label: `Submissions (${candidate.submissions.length})` },
          { key: 'timeline' as const, label: `Timeline (${timeline.length})` },
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

      {/* Answers tab */}
      {tab === 'answers' && (
        <div className="space-y-3">
          {candidate.answers.length === 0 ? (
            <div className="bg-white rounded-[12px] border border-surface-border p-8 text-center text-grey-40">No answers recorded</div>
          ) : candidate.answers.map((a, i) => (
            <div key={a.id} className="bg-white rounded-[8px] border border-surface-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium">Step {i + 1}</span>
                <span className="text-sm font-medium text-grey-15">{a.step.title}</span>
              </div>
              {a.step.questionText && <p className="text-sm text-grey-35 mb-2">{a.step.questionText}</p>}
              {a.option && (
                <div className="inline-block px-3 py-1.5 bg-brand-50 text-brand-700 rounded-[6px] text-sm font-medium">
                  {a.option.optionText}
                </div>
              )}
              <div className="text-xs text-grey-50 mt-2">{new Date(a.answeredAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Submissions tab */}
      {tab === 'submissions' && (
        <div className="space-y-4">
          {candidate.submissions.length === 0 ? (
            <div className="bg-white rounded-[12px] border border-surface-border p-8 text-center text-grey-40">No submissions</div>
          ) : candidate.submissions.map(s => (
            <div key={s.id} className="bg-white rounded-[8px] border border-surface-border p-4">
              <div className="text-sm font-medium text-grey-15 mb-2">{s.step.title}</div>
              {s.step.questionText && <p className="text-sm text-grey-35 mb-3">{s.step.questionText}</p>}
              {s.videoStorageKey && (
                <video
                  src={`/uploads/${s.videoStorageKey}`}
                  controls
                  playsInline
                  className="w-full max-w-lg rounded-[8px] bg-black mb-2"
                />
              )}
              {s.textMessage && (
                <div className="bg-surface rounded-[8px] p-3 text-sm text-grey-15 whitespace-pre-wrap">{s.textMessage}</div>
              )}
              <div className="text-xs text-grey-50 mt-2">{new Date(s.submittedAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline tab */}
      {tab === 'timeline' && (
        <div className="bg-white rounded-[12px] border border-surface-border p-6">
          <div className="space-y-0">
            {timeline.map((event, i) => (
              <div key={i} className="flex gap-4 pb-6 last:pb-0">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    event.type === 'success' ? 'bg-green-500' :
                    event.type === 'error' ? 'bg-red-500' :
                    event.type === 'start' ? 'bg-brand-500' :
                    event.type === 'scheduled' ? 'bg-amber-400 ring-2 ring-amber-200' :
                    'bg-gray-300'
                  }`} />
                  {i < timeline.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                </div>
                <div className="pb-2">
                  <div className="text-sm text-grey-15 font-medium">{event.label}</div>
                  {event.detail && <div className="text-xs text-grey-35 mt-0.5">{event.detail}</div>}
                  <div className="text-xs text-grey-40 mt-0.5">{new Date(event.time).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showLogMeeting && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-[12px] shadow-2xl p-8 w-full max-w-[480px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-grey-15 mb-1">Log scheduled meeting</h2>
            <p className="text-sm text-grey-40 mb-5">Record a meeting the candidate has booked. This also advances them to the &quot;Scheduled&quot; pipeline stage.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Meeting date &amp; time</label>
                <input type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Meeting link (optional)</label>
                <input type="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://meet.google.com/…" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Notes (optional)</label>
                <textarea value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)} rows={3} className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowLogMeeting(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={logMeeting} disabled={savingMeeting || !meetingAt} className="btn-primary flex-1 disabled:opacity-50">{savingMeeting ? 'Saving…' : 'Log meeting'}</button>
            </div>
          </div>
        </div>
      )}

      {previewState && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !runningAutomations) setPreviewState(null) }}
        >
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-[520px]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-3">
              <h2 className="text-lg font-semibold text-grey-15">Run automations for &quot;{activeStage.label}&quot;</h2>
              <p className="text-sm text-grey-40 mt-1">
                These rules will run immediately for this candidate. Configured delays are
                ignored — manual run sends now.
              </p>
            </div>
            <div className="px-6 pb-2 max-h-[50vh] overflow-y-auto">
              {previewState.loading ? (
                <div className="py-6 text-center text-sm text-grey-40">Loading…</div>
              ) : previewState.error ? (
                <div className="py-3 px-3 rounded-[8px] bg-red-50 text-red-700 text-sm">{previewState.error}</div>
              ) : previewState.rules.length === 0 ? (
                <div className="py-6 text-center text-sm text-grey-40">No matching active rules.</div>
              ) : (
                <ul className="divide-y divide-surface-divider rounded-[8px] border border-surface-border">
                  {previewState.rules.map((r) => (
                    <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-grey-15 truncate">{r.name}</div>
                        <div className="text-xs text-grey-40 mt-0.5">
                          Trigger: {triggerLabels[r.triggerType] ?? r.triggerType}
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/automations?rule=${r.id}`}
                        target="_blank"
                        className="text-xs text-brand-600 hover:underline shrink-0 mt-0.5"
                      >
                        View
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-6 py-4 flex justify-end gap-2 border-t border-surface-divider mt-2">
              <button
                onClick={() => setPreviewState(null)}
                disabled={runningAutomations}
                className="text-sm px-4 py-2 rounded-[8px] text-grey-40 hover:text-grey-15 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={runStageAutomations}
                disabled={runningAutomations || previewState.loading || previewState.rules.length === 0}
                className="text-sm px-4 py-2 rounded-[8px] bg-brand-500 text-white font-semibold hover:bg-brand-600 disabled:opacity-50"
              >
                {runningAutomations
                  ? 'Firing…'
                  : `Fire ${previewState.rules.length} now`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
