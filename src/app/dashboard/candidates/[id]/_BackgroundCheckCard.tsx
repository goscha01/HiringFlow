'use client'

/**
 * BackgroundCheckCard — Certn integration UI on the candidate detail page.
 *
 * Shows the most recent BackgroundCheck for this Session, with actions:
 *   - Order (when none active)
 *   - Copy invite link
 *   - Refresh status (force-sync from Certn — useful between webhook deliveries)
 *   - Download report (lazy: generate-report → poll → open presigned URL)
 *   - Cancel
 *
 * Status badges map directly to Certn's case lifecycle. The score badge only
 * appears once a check completes.
 */

import { useEffect, useState } from 'react'

interface BackgroundCheck {
  id: string
  certnCaseId: string
  status: string
  overallScore: string | null
  inviteLink: string | null
  createdAt: string
  lastSyncedAt: string | null
  completedAt: string | null
}

const TERMINAL = new Set(['COMPLETE', 'CANCELLED', 'APPLICANT_EXPIRED', 'APPLICANT_DECLINED', 'INVITE_UNDELIVERABLE'])

const STATUS_LABELS: Record<string, string> = {
  CASE_ORDERED: 'Ordered',
  APPLICANT_INVITED: 'Awaiting applicant',
  APPLICANT_OPENED: 'Applicant opened invite',
  APPLICANT_STARTED: 'Applicant started',
  APPLICANT_SUBMITTED: 'Submitted — running checks',
  IN_PROGRESS: 'Checks in progress',
  PENDING_FULFILLMENT: 'Checks queued',
  CLIENT_ACTION_REQUIRED: 'Action required',
  APPLICANT_ACTION_REQUIRED: 'Applicant action required',
  IN_DISPUTE: 'In dispute',
  APPLICANT_EXPIRED: 'Invite expired',
  APPLICANT_DECLINED: 'Applicant declined',
  INVITE_UNDELIVERABLE: 'Invite undeliverable',
  CANCELLED: 'Cancelled',
  COMPLETE: 'Complete',
}

const SCORE_TONE: Record<string, { bg: string; text: string; label: string }> = {
  CLEAR:          { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Clear' },
  NOT_APPLICABLE: { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Clear (N/A)' },
  REVIEW:         { bg: 'bg-amber-100',  text: 'text-amber-800',  label: 'Needs review' },
  RESTRICTED:     { bg: 'bg-amber-100',  text: 'text-amber-800',  label: 'Restricted' },
  REJECT:         { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Adverse findings' },
}

const STATUS_TONE: Record<string, string> = {
  COMPLETE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-grey-100 text-grey-40',
  APPLICANT_EXPIRED: 'bg-amber-100 text-amber-800',
  APPLICANT_DECLINED: 'bg-red-100 text-red-700',
  INVITE_UNDELIVERABLE: 'bg-red-100 text-red-700',
  CLIENT_ACTION_REQUIRED: 'bg-amber-100 text-amber-800',
  APPLICANT_ACTION_REQUIRED: 'bg-amber-100 text-amber-800',
}

export function BackgroundCheckCard({ sessionId }: { sessionId: string }) {
  const [checks, setChecks] = useState<BackgroundCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | 'order' | 'sync' | 'cancel' | 'report' | 'copy'>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => { void load() }, [sessionId])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/candidates/${sessionId}/background-check`)
      if (!r.ok) {
        setChecks([])
        return
      }
      const d = await r.json() as { checks: BackgroundCheck[] }
      setChecks(d.checks || [])
    } finally {
      setLoading(false)
    }
  }

  function showToast(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text })
    setTimeout(() => setToast(null), 3000)
  }

  async function order() {
    setBusy('order')
    try {
      const r = await fetch(`/api/candidates/${sessionId}/background-check`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) {
        showToast('err', d.message || d.error || 'Failed to order check')
        return
      }
      showToast('ok', d.reused ? 'Already had an active check' : 'Background check ordered')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function sync() {
    setBusy('sync')
    try {
      const r = await fetch(`/api/candidates/${sessionId}/background-check?action=sync`, { method: 'PATCH' })
      const d = await r.json()
      if (!r.ok) {
        showToast('err', d.message || d.error || 'Sync failed')
        return
      }
      showToast('ok', 'Synced')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function cancel() {
    if (!confirm('Cancel this background check? Certn will be notified.')) return
    setBusy('cancel')
    try {
      const r = await fetch(`/api/candidates/${sessionId}/background-check`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) {
        showToast('err', d.message || d.error || 'Cancel failed')
        return
      }
      showToast('ok', 'Cancelled')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function downloadReport() {
    setBusy('report')
    try {
      const r = await fetch(`/api/candidates/${sessionId}/background-check?action=report`, { method: 'PATCH' })
      const d = await r.json() as { ok: boolean; url?: string; reportFileId?: string; error?: string; message?: string }
      if (!r.ok) {
        showToast('err', d.message || d.error || 'Report failed')
        return
      }
      if (d.url) {
        window.open(d.url, '_blank', 'noopener,noreferrer')
      } else {
        showToast('ok', 'Report is generating — try again in a few seconds')
      }
    } finally {
      setBusy(null)
    }
  }

  async function copyInvite(link: string) {
    setBusy('copy')
    try {
      await navigator.clipboard.writeText(link)
      showToast('ok', 'Invite link copied')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-[12px] border border-surface-border p-4">
        <div className="text-sm text-grey-40">Loading background check…</div>
      </div>
    )
  }

  const active = checks.find((c) => !TERMINAL.has(c.status)) || null
  const latest = active || checks[0] || null

  return (
    <div className="bg-white rounded-[12px] border border-surface-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-grey-15">Background check</h3>
          {latest && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_TONE[latest.status] || 'bg-brand-50 text-brand-700'}`}>
              {STATUS_LABELS[latest.status] || latest.status}
            </span>
          )}
          {latest?.overallScore && SCORE_TONE[latest.overallScore] && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${SCORE_TONE[latest.overallScore].bg} ${SCORE_TONE[latest.overallScore].text}`}>
              {SCORE_TONE[latest.overallScore].label}
            </span>
          )}
        </div>
        {latest && (
          <span className="text-[11px] text-grey-50">
            {latest.lastSyncedAt ? `Synced ${new Date(latest.lastSyncedAt).toLocaleString()}` : `Created ${new Date(latest.createdAt).toLocaleString()}`}
          </span>
        )}
      </div>

      {toast && (
        <div className={`mb-3 px-3 py-2 rounded-[8px] text-xs border ${toast.kind === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {toast.text}
        </div>
      )}

      {!latest && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-grey-40">No background check ordered yet.</p>
          <button onClick={order} disabled={busy !== null} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
            {busy === 'order' ? 'Ordering…' : 'Order check'}
          </button>
        </div>
      )}

      {latest && (
        <div className="space-y-3">
          {active?.inviteLink && (
            <div className="bg-surface rounded-[8px] p-3">
              <div className="text-[11px] uppercase tracking-wide text-grey-40 mb-1.5">Invite link</div>
              <div className="flex gap-2">
                <code className="flex-1 px-2 py-1.5 bg-white rounded-[6px] text-xs text-grey-15 font-mono break-all border border-surface-border">{active.inviteLink}</code>
                <button onClick={() => copyInvite(active.inviteLink!)} disabled={busy !== null} className="text-xs px-3 py-1.5 border border-surface-border rounded-[6px] hover:bg-white">
                  {busy === 'copy' ? 'Copying…' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!active && (
              <button onClick={order} disabled={busy !== null} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                {busy === 'order' ? 'Ordering…' : 'Order new check'}
              </button>
            )}
            {!TERMINAL.has(latest.status) && (
              <button onClick={sync} disabled={busy !== null} className="text-xs px-3 py-1.5 border border-surface-border rounded-[6px] hover:bg-surface disabled:opacity-50">
                {busy === 'sync' ? 'Syncing…' : 'Refresh status'}
              </button>
            )}
            {latest.status === 'COMPLETE' && (
              <button onClick={downloadReport} disabled={busy !== null} className="text-xs px-3 py-1.5 border border-surface-border rounded-[6px] hover:bg-surface disabled:opacity-50">
                {busy === 'report' ? 'Generating…' : 'Download report'}
              </button>
            )}
            {!TERMINAL.has(latest.status) && (
              <button onClick={cancel} disabled={busy !== null} className="text-xs px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-[6px] ml-auto disabled:opacity-50">
                {busy === 'cancel' ? 'Cancelling…' : 'Cancel'}
              </button>
            )}
          </div>

          <div className="text-[11px] text-grey-50 font-mono">
            Certn case: {latest.certnCaseId}
          </div>
        </div>
      )}
    </div>
  )
}
