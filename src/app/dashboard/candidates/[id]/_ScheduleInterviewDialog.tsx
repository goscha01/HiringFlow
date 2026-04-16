'use client'

/**
 * ScheduleInterviewDialog — Meet integration v2.
 *
 * Shown only when the workspace has `meetIntegrationV2Enabled` AND Meet
 * scopes have been granted. The Record toggle's state is driven by the
 * integration's recordingCapable field. When it's false, the toggle is
 * disabled and the capability message is shown; when it's true, the toggle
 * is on by default.
 */

import { useEffect, useState } from 'react'

interface MeetStatus {
  configured: boolean
  connected: boolean
  meetV2: {
    flagEnabled: boolean
    scopesGranted: boolean
    recordingCapable: boolean | null
    recordingCapabilityMessage: string
  } | null
}

export function ScheduleInterviewDialog({
  candidateId,
  candidateEmail,
  onClose,
  onScheduled,
}: {
  candidateId: string
  candidateEmail: string | null
  onClose: () => void
  onScheduled: () => void
}) {
  const [status, setStatus] = useState<MeetStatus | null>(null)
  const [scheduledAt, setScheduledAt] = useState(() => {
    // Default: tomorrow at 10am local
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [record, setRecord] = useState(true)
  const [notes, setNotes] = useState('')
  const [email, setEmail] = useState(candidateEmail || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/integrations/google').then((r) => r.json()).then(setStatus)
  }, [])

  const capable = status?.meetV2?.recordingCapable
  const recordDisabled = capable === false
  useEffect(() => {
    if (recordDisabled && record) setRecord(false)
  }, [recordDisabled, record])

  if (!status) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-[12px] p-6 text-sm">Loading…</div>
      </div>
    )
  }

  if (!status.meetV2?.flagEnabled) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded-[12px] p-6 max-w-md" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-semibold text-grey-15">Meet scheduling not enabled</h3>
          <p className="mt-2 text-sm text-grey-40">
            In-app Google Meet scheduling is not enabled for this workspace. Use the existing &quot;Log Meeting&quot; flow instead, or contact support to enable it.
          </p>
          <div className="mt-4 flex justify-end">
            <button className="btn-secondary text-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  if (!status.meetV2.scopesGranted) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded-[12px] p-6 max-w-md" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-semibold text-grey-15">Reconnect Google account</h3>
          <p className="mt-2 text-sm text-grey-40">
            Meet scheduling requires additional permissions. Reconnect your Google account from Settings → Integrations to grant them.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-secondary text-sm" onClick={onClose}>Close</button>
            <a className="btn-primary text-sm" href="/api/integrations/google/connect">Reconnect</a>
          </div>
        </div>
      </div>
    )
  }

  const submit = async () => {
    if (!email) { setError('Candidate email is required to send the calendar invite'); return }
    setSubmitting(true); setError(null); setWarnings([])
    try {
      const res = await fetch(`/api/candidates/${candidateId}/schedule-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes,
          record,
          notes: notes || undefined,
          attendeeEmail: email,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.message || body?.error || 'Failed to schedule')
        return
      }
      if (Array.isArray(body.warnings) && body.warnings.length) setWarnings(body.warnings)
      onScheduled()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-[12px] p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-grey-15">Schedule interview</h3>
        <p className="text-sm text-grey-40 mt-0.5">A Google Meet link will be created and a calendar invite sent to the candidate.</p>

        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-grey-40">Candidate email</span>
            <input type="email" className="mt-1 w-full border border-surface-border rounded-[8px] px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-grey-40">Date &amp; time</span>
            <input type="datetime-local" className="mt-1 w-full border border-surface-border rounded-[8px] px-3 py-2" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-grey-40">Duration (minutes)</span>
            <input type="number" min={10} max={240} className="mt-1 w-full border border-surface-border rounded-[8px] px-3 py-2" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-grey-40">Notes (optional)</span>
            <textarea className="mt-1 w-full border border-surface-border rounded-[8px] px-3 py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className={`p-3 rounded-[8px] ${recordDisabled ? 'bg-gray-50' : 'bg-surface-weak'}`}>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-medium text-grey-15">Record this interview</div>
                <div className="text-xs text-grey-40 mt-0.5">
                  {recordDisabled
                    ? status.meetV2.recordingCapabilityMessage
                    : capable === true
                      ? 'Recording will start automatically when the meeting begins.'
                      : "We'll try to enable recording — if your Google plan doesn't support it we'll schedule without it."}
                </div>
              </div>
              <input
                type="checkbox"
                checked={record}
                disabled={recordDisabled}
                onChange={(e) => setRecord(e.target.checked)}
                className="ml-3 h-4 w-4"
              />
            </label>
          </div>
        </div>

        {error && <div className="mt-3 p-2 rounded-[8px] bg-red-50 text-xs text-red-700">{error}</div>}
        {warnings.length > 0 && (
          <div className="mt-3 p-2 rounded-[8px] bg-amber-50 text-xs text-amber-800">
            {warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary text-sm" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary text-sm" onClick={submit} disabled={submitting}>
            {submitting ? 'Scheduling…' : 'Schedule interview'}
          </button>
        </div>
      </div>
    </div>
  )
}
