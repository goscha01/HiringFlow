'use client'

/**
 * InterviewPanel — surfaces Meet integration v2 meetings for a candidate
 * (scheduled → started → ended → recording ready). Kept visually separate
 * from the legacy SchedulingEvent timeline so the two paths can coexist
 * during rollout.
 */

import { useCallback, useEffect, useState } from 'react'
import { ScheduleInterviewDialog } from './_ScheduleInterviewDialog'

interface InterviewMeeting {
  id: string
  meetingUri: string
  meetingCode: string | null
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
  actualEnd: string | null
  recordingEnabled: boolean
  recordingState: string
  recordingProvider: string | null
  transcriptState: string
  driveRecordingFileId: string | null
  driveTranscriptFileId: string | null
  participants: Array<{ email?: string; displayName?: string; joinTime?: string; leaveTime?: string }> | null
  createdAt: string
}

function stateLabel(m: InterviewMeeting): { text: string; tone: 'blue' | 'green' | 'gray' | 'amber' } {
  if (m.actualEnd) return { text: 'Ended', tone: 'gray' }
  if (m.actualStart) return { text: 'In progress', tone: 'green' }
  const inPast = new Date(m.scheduledEnd).getTime() < Date.now()
  if (inPast) return { text: 'Missed or not yet reported', tone: 'amber' }
  return { text: 'Scheduled', tone: 'blue' }
}

export function InterviewPanel({ candidateId, candidateEmail, isRebook }: { candidateId: string; candidateEmail: string | null; isRebook?: boolean }) {
  const [meetings, setMeetings] = useState<InterviewMeeting[] | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [markingNoShow, setMarkingNoShow] = useState<string | null>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [removingRecording, setRemovingRecording] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/candidates/${candidateId}/interview-meetings`)
    if (!res.ok) { setMeetings([]); return }
    const body = await res.json()
    setMeetings(body.meetings || [])
  }, [candidateId])

  const uploadAttendance = useCallback(async (meetingId: string, file: File) => {
    setUploadingFor(meetingId)
    setUploadResult((p) => ({ ...p, [meetingId]: { ok: false, text: 'Uploading…' } }))
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/interview-meetings/${meetingId}/attendance-upload`, { method: 'POST', body: fd })
      const body = await res.json()
      if (!res.ok) {
        setUploadResult((p) => ({ ...p, [meetingId]: { ok: false, text: body.message || body.error || 'Upload failed' } }))
        return
      }
      const summary = body.candidatePresent
        ? `${body.rowCount} rows imported. Candidate found in attendance — meeting marked as completed.`
        : `${body.rowCount} rows imported. Candidate not found — flagged as no-show.`
      setUploadResult((p) => ({ ...p, [meetingId]: { ok: true, text: summary } }))
      await load()
    } catch (err) {
      setUploadResult((p) => ({ ...p, [meetingId]: { ok: false, text: err instanceof Error ? err.message : 'Upload failed' } }))
    } finally {
      setUploadingFor(null)
    }
  }, [load])

  const removeRecording = useCallback(async (meetingId: string) => {
    if (!confirm('Remove this recording from the candidate profile? The video file will remain in your Google Drive — delete it from there if you also want it gone there.')) return
    setRemovingRecording(meetingId)
    try {
      const res = await fetch(`/api/interview-meetings/${meetingId}/remove-recording`, { method: 'POST' })
      if (res.ok) {
        await load()
      } else {
        alert('Could not remove recording. Please retry.')
      }
    } finally {
      setRemovingRecording(null)
    }
  }, [load])

  const markNoShow = useCallback(async (meetingId: string) => {
    if (!confirm('Mark this meeting as a no-show? The candidate will be moved to Rejected and the no-show follow-up automation (if configured) will run.')) return
    setMarkingNoShow(meetingId)
    try {
      const res = await fetch(`/api/interview-meetings/${meetingId}/mark-no-show`, { method: 'POST' })
      if (res.ok) {
        await load()
      } else {
        alert('Could not mark as no-show. Please retry.')
      }
    } finally {
      setMarkingNoShow(null)
    }
  }, [load])

  useEffect(() => {
    fetch('/api/integrations/google').then((r) => r.json()).then((d) => {
      setFeatureOn(!!d?.meetV2?.flagEnabled && !!d?.meetV2?.scopesGranted)
    }).catch(() => setFeatureOn(false))
    load()
  }, [load])

  if (featureOn === false) return null
  if (meetings === null) return null

  return (
    <div className="mt-4 bg-white rounded-[12px] border border-surface-border p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-grey-15">Google Meet interviews</h3>
        <button className="btn-primary text-xs" onClick={() => setShowDialog(true)}>
          Schedule interview
        </button>
      </div>

      {meetings.length === 0 ? (
        <p className="mt-3 text-xs text-grey-40">No Meet interviews scheduled yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {meetings.map((m) => {
            const s = stateLabel(m)
            return (
              <div key={m.id} className="border border-surface-border rounded-[8px] p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-medium text-grey-15">
                        {new Date(m.scheduledStart).toLocaleString()}
                      </div>
                      {isRebook && (
                        <span
                          title="This candidate had a prior no-show and re-booked via the follow-up invite"
                          className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium"
                        >
                          Rebook
                        </span>
                      )}
                    </div>
                    <a className="text-xs text-primary hover:underline break-all" href={m.meetingUri} target="_blank" rel="noopener noreferrer">
                      {m.meetingUri}
                    </a>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    s.tone === 'green' ? 'bg-green-100 text-green-700' :
                    s.tone === 'blue' ? 'bg-blue-100 text-blue-700' :
                    s.tone === 'amber' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-grey-40'
                  }`}>{s.text}</span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-grey-40">
                  {m.actualStart && <div>Started: {new Date(m.actualStart).toLocaleTimeString()}</div>}
                  {m.actualEnd && <div>Ended: {new Date(m.actualEnd).toLocaleTimeString()}</div>}
                  {m.recordingEnabled && (
                    <div>Recording: <span className="text-grey-15">{m.recordingState}</span></div>
                  )}
                  {m.transcriptState !== 'disabled' && (
                    <div>Transcript: <span className="text-grey-15">{m.transcriptState}</span></div>
                  )}
                </div>

                {m.recordingState === 'ready' && m.driveRecordingFileId && (
                  <div className="mt-2">
                    <video
                      controls
                      className="w-full rounded-[6px] border border-surface-border"
                      src={`/api/interview-meetings/${m.id}/recording`}
                    />
                    <div className="flex items-center gap-3 mt-1">
                      <a href={`/api/interview-meetings/${m.id}/recording`} className="text-xs text-primary hover:underline">
                        Download recording
                      </a>
                      <span className="text-grey-40 text-xs">·</span>
                      <button
                        onClick={() => removeRecording(m.id)}
                        disabled={removingRecording === m.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        {removingRecording === m.id ? 'Removing…' : 'Remove recording'}
                      </button>
                    </div>
                  </div>
                )}
                {m.transcriptState === 'ready' && m.driveTranscriptFileId && (
                  <div className="mt-1">
                    <a href={`/api/interview-meetings/${m.id}/transcript`} className="text-xs text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                      View transcript
                    </a>
                  </div>
                )}

                {new Date(m.scheduledEnd).getTime() < Date.now() && (
                  <div className="mt-3 pt-3 border-t border-surface-border space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => markNoShow(m.id)}
                        disabled={markingNoShow === m.id || uploadingFor === m.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        {markingNoShow === m.id ? 'Marking…' : 'Mark as no-show'}
                      </button>
                      <span className="text-grey-40 text-xs">·</span>
                      <label className="text-xs text-primary hover:underline cursor-pointer">
                        <input
                          type="file"
                          accept=".csv,text/csv,text/tab-separated-values,text/plain,application/vnd.ms-excel,.tsv"
                          className="hidden"
                          disabled={uploadingFor === m.id}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) uploadAttendance(m.id, f)
                            e.currentTarget.value = ''
                          }}
                        />
                        {uploadingFor === m.id ? 'Uploading…' : 'Upload attendance file'}
                      </label>
                    </div>
                    {uploadResult[m.id] && (
                      <p className={`text-xs ${uploadResult[m.id].ok ? 'text-green-700' : 'text-red-700'}`}>
                        {uploadResult[m.id].text}
                      </p>
                    )}
                    <p className="text-[11px] text-grey-40">
                      CSV or Google Sheets-exported file. Columns we look for: name, email, joined, left, duration.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showDialog && (
        <ScheduleInterviewDialog
          candidateId={candidateId}
          candidateEmail={candidateEmail}
          onClose={() => setShowDialog(false)}
          onScheduled={() => load()}
        />
      )}
    </div>
  )
}
