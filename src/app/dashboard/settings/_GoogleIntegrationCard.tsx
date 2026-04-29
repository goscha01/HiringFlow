'use client'

import { useEffect, useState } from 'react'

interface MeetV2 {
  flagEnabled: boolean
  scopesGranted: boolean
  hostedDomain: string | null
  recordingCapable: boolean | null
  recordingCapabilityReason: string | null
  recordingCapabilityMessage: string
  recordingCapabilityCheckedAt: string | null
}

interface Status {
  configured: boolean
  connected: boolean
  integration: {
    googleEmail: string
    calendarId: string
    watchExpiresAt: string | null
    lastSyncedAt: string | null
    createdAt: string
  } | null
  meetV2: MeetV2 | null
}

export function GoogleIntegrationCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    // Surface OAuth callback status from URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const integration = params.get('integration')
      const st = params.get('status')
      if (integration === 'google' && st) {
        const map: Record<string, { type: 'success' | 'error'; text: string }> = {
          connected: { type: 'success', text: 'Google Calendar connected. Sync starting in the background.' },
          cancelled: { type: 'error', text: 'Connection cancelled.' },
          invalid: { type: 'error', text: 'Invalid callback — please try again.' },
          expired: { type: 'error', text: 'Connection attempt expired — please try again.' },
          error: { type: 'error', text: `Error: ${params.get('msg') || 'Unknown'}` },
        }
        if (map[st]) setBanner(map[st])
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname + '?tab=integrations')
      }
    }
    fetch('/api/integrations/google').then(r => r.json()).then(d => { setStatus(d); setLoading(false) })
  }, [])

  const disconnect = async () => {
    if (!confirm('Disconnect Google Calendar? We will stop syncing bookings automatically.')) return
    await fetch('/api/integrations/google', { method: 'DELETE' })
    const d = await fetch('/api/integrations/google').then(r => r.json())
    setStatus(d)
    setBanner({ type: 'success', text: 'Google Calendar disconnected.' })
  }

  const [syncing, setSyncing] = useState(false)
  const [authExpired, setAuthExpired] = useState(false)
  const sync = async () => {
    setSyncing(true)
    setBanner(null)
    setAuthExpired(false)
    try {
      const r = await fetch('/api/integrations/google/sync', { method: 'POST' })
      const d = await r.json()
      if (d.needsReconnect) {
        setAuthExpired(true)
        setBanner({
          type: 'error',
          text: 'Google has revoked our access (the refresh token is dead). Click Reconnect to grant access again — your existing settings will be preserved.',
        })
      } else if (!r.ok) {
        setBanner({ type: 'error', text: d.error || 'Sync failed' })
      } else {
        const parts = [
          `Scanned ${d.processed ?? 0} calendar event${d.processed === 1 ? '' : 's'}`,
          `${d.matched ?? 0} matched a candidate`,
        ]
        if (d.backfillError) parts.push(`backfill error: ${d.backfillError}`)
        setBanner({
          type: d.watchOk && !d.backfillError ? 'success' : 'error',
          text: parts.join(' · '),
        })
      }
      const fresh = await fetch('/api/integrations/google').then(r => r.json())
      setStatus(fresh)
    } catch (e) {
      setBanner({ type: 'error', text: e instanceof Error ? e.message : 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <div className="bg-white rounded-[12px] border border-surface-border p-6 text-sm text-grey-40">Loading…</div>

  const meetV2 = status?.meetV2
  const needsReconnect = !!status?.connected && !!meetV2 && meetV2.flagEnabled && !meetV2.scopesGranted
  const recordingBadge = (() => {
    if (!meetV2) return null
    if (meetV2.recordingCapable === true) return { tone: 'green', text: 'Recording available' }
    if (meetV2.recordingCapable === false) return { tone: 'amber', text: 'Recording unavailable' }
    return { tone: 'gray', text: 'Recording: not yet checked' }
  })()

  return (
    <div className="bg-white rounded-[12px] border border-surface-border p-6">
      {banner && (
        <div className={`mb-4 px-3 py-2 rounded-[8px] text-sm ${banner.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {banner.text}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-[10px] bg-white border border-surface-border flex items-center justify-center">
            <svg viewBox="0 0 48 48" className="w-7 h-7"><path fill="#4285F4" d="M43 40h-7V22h7z"/><path fill="#EA4335" d="M12 40h7V22h-7z"/><path fill="#FBBC04" d="M36 40h-7V8h7z"/><path fill="#34A853" d="M19 8v8h-7V8z"/><path fill="#188038" d="M12 40V16h7v8h10v16z"/></svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-grey-15">Google Calendar &amp; Meet</h3>
            <p className="text-sm text-grey-40 mt-0.5 max-w-md">
              Auto-detect booked interviews and, when enabled, schedule Google Meet interviews directly from HiringFlow with recording support on qualifying Google plans.
            </p>
          </div>
        </div>
        <div>
          {!status?.configured ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">Not configured</span>
          ) : status.connected ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">Connected</span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-grey-40 font-medium">Not connected</span>
          )}
        </div>
      </div>

      {!status?.configured && (
        <div className="mt-4 p-3 bg-amber-50 rounded-[8px] text-xs text-amber-800">
          Admin setup required: set <code className="bg-white px-1 rounded">GOOGLE_CLIENT_ID</code>, <code className="bg-white px-1 rounded">GOOGLE_CLIENT_SECRET</code>, and <code className="bg-white px-1 rounded">GOOGLE_REDIRECT_URI</code> in environment variables.
        </div>
      )}

      {needsReconnect && (
        <div className="mt-4 p-3 bg-amber-50 rounded-[8px] text-xs text-amber-800 flex items-center justify-between gap-3">
          <span>Meet scheduling requires additional permissions. Reconnect your Google account to enable in-app interview scheduling and recording.</span>
          <a href="/api/integrations/google/connect" className="btn-primary text-xs whitespace-nowrap">Reconnect</a>
        </div>
      )}

      {status?.connected && status.integration && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-surface-border">
            <span className="text-grey-40">Connected as</span>
            <span className="text-grey-15 font-medium">{status.integration.googleEmail}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-surface-border">
            <span className="text-grey-40">Calendar</span>
            <span className="text-grey-15">{status.integration.calendarId}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-surface-border">
            <span className="text-grey-40">Watch expires</span>
            <span className="text-grey-15">{status.integration.watchExpiresAt ? new Date(status.integration.watchExpiresAt).toLocaleString() : '—'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-surface-border">
            <span className="text-grey-40">Last synced</span>
            <span className="text-grey-15">{status.integration.lastSyncedAt ? new Date(status.integration.lastSyncedAt).toLocaleString() : 'Never'}</span>
          </div>
          {meetV2 && meetV2.flagEnabled && meetV2.scopesGranted && recordingBadge && (
            <div className="flex justify-between items-start py-2">
              <span className="text-grey-40">Meet recording</span>
              <div className="text-right">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  recordingBadge.tone === 'green' ? 'bg-green-100 text-green-700' :
                  recordingBadge.tone === 'amber' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-grey-40'
                }`}>{recordingBadge.text}</span>
                <p className="text-xs text-grey-40 mt-1 max-w-xs">{meetV2.recordingCapabilityMessage}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        {status?.connected ? (
          <>
            {authExpired || needsReconnect ? (
              <a href="/api/integrations/google/connect" className="btn-primary text-sm">
                Reconnect Google
              </a>
            ) : (
              <button onClick={sync} disabled={syncing} className="btn-primary text-sm disabled:opacity-50">
                {syncing ? 'Syncing…' : 'Sync calendar now'}
              </button>
            )}
            <button onClick={disconnect} className="btn-secondary text-sm">Disconnect</button>
          </>
        ) : (
          <a
            href="/api/integrations/google/connect"
            className={`btn-primary text-sm ${!status?.configured ? 'pointer-events-none opacity-50' : ''}`}
          >
            Connect Google
          </a>
        )}
      </div>
    </div>
  )
}
