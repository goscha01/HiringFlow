'use client'

import { useMemo, useState } from 'react'

interface Props {
  configId: string
  token: string
  rescheduleToken: string
  workspaceName: string
  workspaceLogo: string | null
  configName: string
  meetingStartUtc: string | null
  meetingDurationMinutes: number
}

export function CancelClient(props: Props) {
  const browserTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
  }, [])
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCancel() {
    setSubmitting(true); setError(null)
    try {
      const r = await fetch(`/api/public/booking/${props.configId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: props.token, reason: reason || null }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.message || data.error || 'Cancel failed')
      setDone(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!props.meetingStartUtc && !done) {
    return (
      <Shell {...props}>
        <div className="px-10 py-12 max-w-2xl mx-auto text-center">
          <h1 className="text-[22px] font-semibold text-[#262626] mb-2">No upcoming meeting</h1>
          <p className="text-[14px] text-[#666]">There&apos;s no scheduled meeting to cancel — it may have already happened or been cancelled.</p>
        </div>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell {...props}>
        <div className="px-10 py-12 max-w-2xl mx-auto">
          <div className="w-12 h-12 rounded-full bg-[#FF9500] flex items-center justify-center mb-5">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h1 className="text-[26px] font-semibold text-[#262626] mb-2">Meeting cancelled</h1>
          <p className="text-[14px] text-[#666]">The interview has been cancelled and removed from the calendar.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell {...props}>
      <div className="px-10 py-12 max-w-2xl mx-auto">
        <h1 className="text-[24px] font-semibold text-[#262626] mb-1">Cancel this interview?</h1>
        <p className="text-[14px] text-[#666] mb-6">{props.configName}</p>
        {props.meetingStartUtc && (
          <div className="border border-[#E5E7EB] rounded-md p-4 mb-6">
            <div className="text-[12px] uppercase tracking-wider text-[#888] mb-1">Scheduled for</div>
            <div className="text-[#262626] font-medium text-[15px]">{formatSlotFull(new Date(props.meetingStartUtc), browserTz, props.meetingDurationMinutes)}</div>
            <div className="text-[12px] text-[#888] mt-1.5">Your timezone: {browserTz}</div>
          </div>
        )}
        <label className="block mb-4">
          <span className="text-[12px] text-[#444] block mb-1">Reason (optional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Let the team know why you can't make it…"
            className="w-full px-3 py-2 border border-[#E5E7EB] rounded-md text-[13px] text-[#262626] focus:outline-none focus:border-[#FF9500]"
          />
        </label>
        {error && <div className="text-[13px] text-red-600 mb-3">{error}</div>}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-5 py-2.5 rounded-md bg-red-500 text-white text-[13px] font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Cancelling…' : 'Confirm cancellation'}
          </button>
          <a
            href={`/book/${props.configId}/reschedule?t=${encodeURIComponent(props.rescheduleToken)}`}
            className="px-5 py-2.5 rounded-md border border-[#E5E7EB] text-[#262626] text-[13px] font-medium hover:border-[#FF9500] transition-colors"
          >
            Reschedule instead
          </a>
        </div>
        <p className="mt-4 text-[12px] text-[#888]">If you change your mind, you can reschedule from the same email.</p>
      </div>
    </Shell>
  )
}

function Shell({ children, workspaceName, workspaceLogo }: Props & { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '"Inter", "Be Vietnam Pro", system-ui, -apple-system, sans-serif', color: '#262626' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white shadow-sm">
          <div className="px-8 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5">
            {workspaceLogo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={workspaceLogo} alt={workspaceName} className="w-7 h-7 rounded-full object-cover" />
              : <div className="w-7 h-7 rounded-full bg-[#FF9500] text-white flex items-center justify-center text-[12px] font-medium">{(workspaceName || '?').charAt(0).toUpperCase()}</div>}
            <div className="text-[13px] text-[#666]">{workspaceName}</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

function formatSlotFull(d: Date, tz: string, durationMinutes: number): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
  const start = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const end = new Date(d.getTime() + durationMinutes * 60_000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  return `${day}, ${start}–${end}`
}
