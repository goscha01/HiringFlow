'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { InterviewPanel } from './_InterviewPanel'

interface Answer {
  id: string; answeredAt: string
  step: { id: string; title: string; questionText: string | null; stepType: string; questionType: string }
  option: { id: string; optionText: string } | null
}
interface Submission {
  id: string; submittedAt: string; videoStorageKey: string | null; videoFilename: string | null; textMessage: string | null
  step: { id: string; title: string; questionText: string | null }
}
interface TrainingEnrollment {
  id: string; status: string; startedAt: string; completedAt: string | null
  training: { id: string; title: string }
}
interface SchedulingEvent { id: string; eventType: string; eventAt: string; metadata: Record<string, any> | null }
interface AutomationExec {
  id: string; status: string; errorMessage: string | null; sentAt: string | null; scheduledFor: string | null; createdAt: string
  automationRule: {
    id: string; name: string; triggerType: string; nextStepType: string | null
    emailDestination: string; emailDestinationAddress: string | null; delayMinutes: number
    training: { title: string; slug: string } | null
    schedulingConfig: { name: string; schedulingUrl: string } | null
    emailTemplate: { name: string; subject: string } | null
    chainedBy: { id: string; name: string; delayMinutes: number }[]
  }
}
interface CandidateDetail {
  id: string; candidateName: string | null; candidateEmail: string | null; candidatePhone: string | null
  formData: Record<string, string> | null; outcome: string | null; pipelineStatus: string | null
  startedAt: string; finishedAt: string | null; source: string | null; campaign: string | null
  rejectionReason: string | null; rejectionReasonAt: string | null
  flow: { id: string; name: string; slug: string } | null
  ad: { id: string; name: string; source: string } | null
  answers: Answer[]; submissions: Submission[]
  trainingEnrollments: TrainingEnrollment[]; schedulingEvents: SchedulingEvent[]
  automationExecutions?: AutomationExec[]
  formFieldLabels?: Record<string, string>
  isRebook?: boolean
}

const REJECTION_PRESETS = ['No-show', 'Not qualified', 'Declined offer', 'Wrong location', 'Pay expectations']

const PIPELINE_STEPS = [
  { value: 'applied', label: 'Applied' },
  { value: 'completed_flow', label: 'Completed Flow' },
  { value: 'passed', label: 'Passed' },
  { value: 'training_in_progress', label: 'Training' },
  { value: 'training_completed', label: 'Trained' },
  { value: 'invited_to_schedule', label: 'Invited' },
  { value: 'scheduled', label: 'Scheduled' },
]

export default function CandidateDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'answers' | 'submissions' | 'timeline'>('answers')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch(`/api/candidates/${id}`).then(r => r.json()).then(d => { setCandidate(d); setLoading(false) })
  }, [id])

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
    }
  }
  const clearReason = () => saveReason('')

  const [showLogMeeting, setShowLogMeeting] = useState(false)
  const [meetingAt, setMeetingAt] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [meetingNotes, setMeetingNotes] = useState('')
  const [savingMeeting, setSavingMeeting] = useState(false)

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

  const currentStepIdx = PIPELINE_STEPS.findIndex(s => s.value === candidate.pipelineStatus)

  // Build timeline events
  const timeline: { label: string; time: string; type: string; detail?: string }[] = []
  timeline.push({ label: 'Applied / Flow started', time: candidate.startedAt, type: 'start' })
  if (candidate.finishedAt) timeline.push({ label: `Flow ${candidate.outcome || 'completed'}`, time: candidate.finishedAt, type: candidate.outcome === 'passed' ? 'success' : candidate.outcome === 'failed' ? 'error' : 'info' })
  candidate.trainingEnrollments.forEach(e => {
    timeline.push({ label: `Training started: ${e.training.title}`, time: e.startedAt, type: 'info' })
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
      meeting_no_show: 'Candidate no-show',
    }
    const successTypes = new Set(['marked_scheduled', 'meeting_scheduled', 'meeting_rescheduled'])
    const errorTypes = new Set(['meeting_cancelled', 'meeting_no_show'])
    const type = errorTypes.has(e.eventType) ? 'error' : successTypes.has(e.eventType) ? 'success' : 'info'
    const meta = e.metadata || {}
    const bits: string[] = []
    if (meta.scheduledAt) bits.push(`When: ${new Date(meta.scheduledAt).toLocaleString()}`)
    if (meta.meetingUrl) bits.push(`Link: ${meta.meetingUrl}`)
    if (meta.notes) bits.push(`Notes: ${meta.notes}`)
    timeline.push({ label: labels[e.eventType] || e.eventType, time: e.eventAt, type, detail: bits.join(' · ') || undefined })
  })
  ;(candidate.automationExecutions || []).forEach(e => {
    const r = e.automationRule
    const destLabel = r.emailDestination === 'company' ? 'Company' : r.emailDestination === 'specific' ? (r.emailDestinationAddress || 'Specific') : 'Applicant'
    const nextStep = r.nextStepType === 'training' && r.training ? `Training — ${r.training.title}`
      : r.nextStepType === 'scheduling' && r.schedulingConfig ? `Scheduling — ${r.schedulingConfig.name}`
      : r.chainedBy.length > 0 ? `Chains to → ${r.chainedBy.map(c => c.name + (c.delayMinutes ? ` (+${c.delayMinutes}m)` : '')).join(', ')}`
      : r.nextStepType === 'email' ? 'Send email only'
      : 'No follow-up'
    const delayStr = r.delayMinutes > 0 ? (r.delayMinutes >= 1440 ? `${Math.round(r.delayMinutes / 1440)}d` : r.delayMinutes >= 60 ? `${Math.round(r.delayMinutes / 60)}h` : `${r.delayMinutes}m`) : null
    const bits = [
      `To: ${destLabel}`,
      r.emailTemplate ? `Template: ${r.emailTemplate.name}` : null,
      `Next step: ${nextStep}`,
      delayStr ? `Delay: ${delayStr}` : null,
    ].filter(Boolean).join(' · ')
    const base = `Automation: ${r.name}`
    if (e.status === 'sent') {
      timeline.push({ label: `${base} — email sent`, detail: bits, time: e.sentAt || e.createdAt, type: 'success' })
    } else if (e.status === 'failed') {
      timeline.push({ label: `${base} — failed${e.errorMessage ? `: ${e.errorMessage}` : ''}`, detail: bits, time: e.createdAt, type: 'error' })
    } else if (e.status === 'queued' && e.scheduledFor) {
      timeline.push({ label: `${base} — scheduled`, detail: `${bits} · Fires at ${new Date(e.scheduledFor).toLocaleString()}`, time: e.scheduledFor, type: 'scheduled' })
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
            </div>
            <input
              type="text"
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              placeholder="Or type a custom reason"
              className="w-full px-3 py-2 border border-surface-border rounded-[8px] text-sm text-grey-15 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              autoFocus
            />
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

      {/* Pipeline progress */}
      <div className="bg-white rounded-[12px] border border-surface-border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-grey-15">Pipeline</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowLogMeeting(true)} className="text-xs px-3 py-1.5 rounded-[6px] bg-purple-100 text-purple-700 hover:bg-purple-200 font-medium">Log meeting</button>
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
        <div className="flex gap-1">
          {PIPELINE_STEPS.map((step, i) => {
            const isActive = step.value === candidate.pipelineStatus
            const isPast = i <= currentStepIdx
            return (
              <button
                key={step.value}
                onClick={() => updateStatus(step.value)}
                className={`flex-1 py-2.5 text-xs font-medium rounded-[6px] transition-colors ${
                  isActive ? 'bg-brand-500 text-white' :
                  isPast ? 'bg-brand-100 text-brand-700' :
                  'bg-surface text-grey-40 hover:bg-surface-light'
                }`}
              >
                {step.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-[8px] border border-surface-border p-4">
          <div className="text-xs text-grey-40 mb-1">Source</div>
          <div className="text-sm font-medium text-grey-15 capitalize">{candidate.ad?.source || candidate.source || 'Direct'}</div>
          {candidate.ad && <div className="text-xs text-grey-40 mt-0.5">{candidate.ad.name}</div>}
        </div>
        <div className="bg-white rounded-[8px] border border-surface-border p-4">
          <div className="text-xs text-grey-40 mb-1">Outcome</div>
          <div className={`text-sm font-medium ${candidate.outcome === 'passed' ? 'text-green-700' : candidate.outcome === 'failed' ? 'text-red-600' : 'text-grey-15'}`}>
            {candidate.outcome ? candidate.outcome.charAt(0).toUpperCase() + candidate.outcome.slice(1) : 'In progress'}
          </div>
        </div>
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
    </div>
  )
}
