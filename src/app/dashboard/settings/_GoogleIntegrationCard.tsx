'use client'

import { useEffect, useState } from 'react'

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

  if (loading) return <div className="bg-white rounded-[12px] border border-surface-border p-6 text-sm text-grey-40">Loading…</div>

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
            <h3 className="text-lg font-semibold text-grey-15">Google Calendar</h3>
            <p className="text-sm text-grey-40 mt-0.5 max-w-md">
              Auto-detect scheduled interviews when candidates book via Calendly, Cal.com, or any scheduler that writes to your Google Calendar. Meetings appear on the candidate timeline and Scheduling page automatically.
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
          <div className="flex justify-between py-2">
            <span className="text-grey-40">Last synced</span>
            <span className="text-grey-15">{status.integration.lastSyncedAt ? new Date(status.integration.lastSyncedAt).toLocaleString() : 'Never'}</span>
          </div>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        {status?.connected ? (
          <button onClick={disconnect} className="btn-secondary text-sm">Disconnect</button>
        ) : (
          <a
            href="/api/integrations/google/connect"
            className={`btn-primary text-sm ${!status?.configured ? 'pointer-events-none opacity-50' : ''}`}
          >
            Connect Google Calendar
          </a>
        )}
      </div>
    </div>
  )
}
