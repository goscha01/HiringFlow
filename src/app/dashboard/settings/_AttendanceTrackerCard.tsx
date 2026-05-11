'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Stable extension ID computed from the manifest's `key` field.
 * Generated once via openssl + sha256 (see hirefunnel-meet-extension repo).
 * Pinning the ID here lets the dashboard call
 * chrome.runtime.sendMessage(EXTENSION_ID, ...) without the user having
 * to copy/paste it from chrome://extensions.
 */
const EXTENSION_ID = 'eijbbbhihnoejaegheikoebdpmmjlmbe'

/**
 * Per-workspace opt-out marker. When the user clicks Disconnect we set this
 * key in localStorage so the auto-connect logic doesn't immediately
 * re-provision a token on the next page load. Hitting Reconnect clears it.
 */
const OPTOUT_KEY = 'hf_meet_tracker_optout_workspace'

type ExtensionState =
  | { kind: 'detecting' }
  | { kind: 'not_installed' }
  | { kind: 'connecting' }
  | { kind: 'opted_out'; version: string }
  | { kind: 'bound_elsewhere'; version: string; otherWorkspaceId: string }
  | { kind: 'connected'; version: string; lastUsedAt: string | null; prefix: string }
  | { kind: 'error'; version: string; message: string }

type TokenStatus = {
  connected: boolean
  apiBaseUrl: string
  workspaceId: string
  token: { id: string; prefix: string; createdAt: string; lastUsedAt: string | null } | null
}

type PingResult = { installed: boolean; version?: string; workspaceId?: string | null; connected?: boolean }

interface ChromeRuntime {
  sendMessage(
    extensionId: string,
    msg: unknown,
    cb: (res: { ok: boolean; version?: string; workspaceId?: string | null; connected?: boolean; reason?: string } | undefined) => void,
  ): void
  lastError?: { message?: string }
}

function getChromeRuntime(): ChromeRuntime | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { chrome?: { runtime?: ChromeRuntime } }
  return w.chrome?.runtime ?? null
}

function pingExtension(): Promise<PingResult> {
  return new Promise((resolve) => {
    const runtime = getChromeRuntime()
    if (!runtime) { resolve({ installed: false }); return }
    let settled = false
    const safetyTimer = setTimeout(() => {
      if (!settled) { settled = true; resolve({ installed: false }) }
    }, 1500)
    try {
      runtime.sendMessage(EXTENSION_ID, { type: 'PING' }, (res) => {
        if (settled) return
        settled = true
        clearTimeout(safetyTimer)
        const err = runtime.lastError
        if (err || !res?.ok) { resolve({ installed: false }); return }
        resolve({
          installed: true,
          version: res.version,
          workspaceId: res.workspaceId ?? null,
          connected: !!res.connected,
        })
      })
    } catch {
      if (!settled) { settled = true; clearTimeout(safetyTimer); resolve({ installed: false }) }
    }
  })
}

function sendConnect(payload: { apiBaseUrl: string; token: string; workspaceId: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const runtime = getChromeRuntime()
    if (!runtime) { resolve(false); return }
    try {
      runtime.sendMessage(EXTENSION_ID, { type: 'CONNECT', ...payload }, (res) => {
        const err = runtime.lastError
        resolve(!err && !!res?.ok)
      })
    } catch { resolve(false) }
  })
}

function sendDisconnect(): Promise<boolean> {
  return new Promise((resolve) => {
    const runtime = getChromeRuntime()
    if (!runtime) { resolve(false); return }
    try {
      runtime.sendMessage(EXTENSION_ID, { type: 'DISCONNECT' }, (res) => {
        const err = runtime.lastError
        resolve(!err && !!res?.ok)
      })
    } catch { resolve(false) }
  })
}

export function AttendanceTrackerCard() {
  const [state, setState] = useState<ExtensionState>({ kind: 'detecting' })
  const [busy, setBusy] = useState<'disconnect' | 'reconnect' | null>(null)
  const [showInstall, setShowInstall] = useState(false)
  // Prevent the auto-connect effect from racing with manual user actions
  // (e.g. clicking Disconnect mid-detection).
  const autoConnectGuard = useRef(false)

  const runDetect = async () => {
    autoConnectGuard.current = true
    setState({ kind: 'detecting' })
    try {
      const [ping, status] = await Promise.all([
        pingExtension(),
        fetch('/api/integrations/extension/token').then(r => r.json() as Promise<TokenStatus>).catch(() => null),
      ])

      if (!ping.installed) {
        setState({ kind: 'not_installed' })
        return
      }
      const version = ping.version || '?'
      const currentWorkspaceId = status?.workspaceId

      // Happy path: DB token exists. We're connected — render and bail.
      if (status?.connected && status.token) {
        setState({
          kind: 'connected',
          version,
          lastUsedAt: status.token.lastUsedAt,
          prefix: status.token.prefix,
        })
        return
      }

      // User explicitly disconnected this workspace earlier — don't auto-rebind.
      if (typeof window !== 'undefined' &&
          currentWorkspaceId &&
          localStorage.getItem(OPTOUT_KEY) === currentWorkspaceId) {
        setState({ kind: 'opted_out', version })
        return
      }

      // Extension is currently bound to a DIFFERENT workspace than the one
      // the user is viewing — don't silently switch its allegiance. Surface
      // and let them confirm with the Reconnect button.
      if (ping.workspaceId && currentWorkspaceId && ping.workspaceId !== currentWorkspaceId) {
        setState({ kind: 'bound_elsewhere', version, otherWorkspaceId: ping.workspaceId })
        return
      }

      // Safe to auto-bind: extension installed, no active token in DB, and
      // the extension is either untethered or already pointing at this
      // workspace.
      if (autoConnectGuard.current) {
        await runAutoConnect(version)
      }
    } catch (e) {
      setState({ kind: 'error', version: '?', message: e instanceof Error ? e.message : 'Detection failed' })
    }
  }

  const runAutoConnect = async (version: string) => {
    setState({ kind: 'connecting' })
    try {
      const res = await fetch('/api/integrations/extension/token', { method: 'POST' })
      const data = await res.json() as { ok: boolean; apiBaseUrl: string; workspaceId: string; token: string; error?: string }
      if (!res.ok || !data.ok) {
        setState({ kind: 'error', version, message: data.error || 'Failed to issue extension token' })
        return
      }
      const acked = await sendConnect({
        apiBaseUrl: data.apiBaseUrl,
        token: data.token,
        workspaceId: data.workspaceId,
      })
      if (!acked) {
        await fetch('/api/integrations/extension/token', { method: 'DELETE' }).catch(() => {})
        setState({ kind: 'error', version, message: 'Could not hand the token to the extension. Reload chrome://extensions and try again.' })
        return
      }
      // Re-read status from server so we render real createdAt/prefix
      const fresh = await fetch('/api/integrations/extension/token').then(r => r.json() as Promise<TokenStatus>)
      if (fresh.connected && fresh.token) {
        setState({
          kind: 'connected',
          version,
          lastUsedAt: fresh.token.lastUsedAt,
          prefix: fresh.token.prefix,
        })
      }
    } catch (e) {
      setState({ kind: 'error', version, message: e instanceof Error ? e.message : 'Connect failed' })
    }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect HireFunnel Meet Tracker? Live attendance tracking will stop until you reconnect.')) return
    setBusy('disconnect')
    autoConnectGuard.current = false
    try {
      await sendDisconnect()
      const statusRes = await fetch('/api/integrations/extension/token').then(r => r.json() as Promise<TokenStatus>).catch(() => null)
      await fetch('/api/integrations/extension/token', { method: 'DELETE' })
      if (typeof window !== 'undefined' && statusRes?.workspaceId) {
        localStorage.setItem(OPTOUT_KEY, statusRes.workspaceId)
      }
      const version = state.kind === 'connected' || state.kind === 'opted_out' || state.kind === 'error' || state.kind === 'bound_elsewhere' ? state.version : '?'
      setState({ kind: 'opted_out', version })
    } finally {
      setBusy(null)
    }
  }

  const reconnect = async () => {
    setBusy('reconnect')
    try {
      if (typeof window !== 'undefined') localStorage.removeItem(OPTOUT_KEY)
      await runDetect()
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => { runDetect() }, [])

  return (
    <div className="bg-white rounded-[12px] border border-surface-border p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-[10px] bg-white border border-surface-border flex items-center justify-center text-xl">
            ▶
          </div>
          <div>
            <h3 className="text-lg font-semibold text-grey-15">HireFunnel Meet Tracker</h3>
            <p className="text-sm text-grey-40 mt-0.5 max-w-md">
              Chrome extension that captures live attendance from Google Meet —
              advances candidate cards while the meeting is still in progress.
              Works on personal Gmail and any Google Workspace plan.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {state.kind === 'detecting' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-grey-40 font-medium">Detecting…</span>
          )}
          {state.kind === 'connecting' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">Connecting…</span>
          )}
          {state.kind === 'not_installed' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-grey-40 font-medium">Not installed</span>
          )}
          {state.kind === 'opted_out' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-grey-40 font-medium">Disconnected</span>
          )}
          {state.kind === 'bound_elsewhere' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">Bound to another workspace</span>
          )}
          {state.kind === 'connected' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">
              Connected · v{state.version}
            </span>
          )}
          {state.kind === 'error' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium">Error</span>
          )}
        </div>
      </div>

      {state.kind === 'error' && (
        <div className="mt-4 px-3 py-2 rounded-[8px] text-sm bg-red-50 text-red-700">
          {state.message}
        </div>
      )}

      {state.kind === 'bound_elsewhere' && (
        <div className="mt-4 px-3 py-2 rounded-[8px] text-sm bg-amber-50 text-amber-700">
          This extension is currently connected to a different workspace
          (<code className="font-mono">{state.otherWorkspaceId.slice(0, 8)}…</code>). Click
          <strong> Bind to this workspace</strong> below to switch it over — the other workspace will stop receiving attendance data from this extension.
        </div>
      )}

      {state.kind === 'connected' && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-surface-border">
            <span className="text-grey-40">Token</span>
            <span className="text-grey-15 font-mono text-xs">{state.prefix}…</span>
          </div>
          <div className="flex justify-between py-2 border-b border-surface-border">
            <span className="text-grey-40">Last used</span>
            <span className="text-grey-15">
              {state.lastUsedAt ? new Date(state.lastUsedAt).toLocaleString() : 'Never (no meeting yet)'}
            </span>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {state.kind === 'not_installed' && (
          <button onClick={() => setShowInstall((v) => !v)} className="btn-primary text-sm">
            {showInstall ? 'Hide install steps' : 'Install Chrome Extension'}
          </button>
        )}
        {state.kind === 'opted_out' && (
          <button onClick={reconnect} disabled={busy === 'reconnect'} className="btn-primary text-sm disabled:opacity-50">
            {busy === 'reconnect' ? 'Reconnecting…' : 'Reconnect'}
          </button>
        )}
        {state.kind === 'bound_elsewhere' && (
          <button onClick={reconnect} disabled={busy === 'reconnect'} className="btn-primary text-sm disabled:opacity-50">
            {busy === 'reconnect' ? 'Binding…' : 'Bind to this workspace'}
          </button>
        )}
        {state.kind === 'connected' && (
          <button onClick={disconnect} disabled={busy === 'disconnect'} className="btn-secondary text-sm disabled:opacity-50">
            {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
          </button>
        )}
        {state.kind === 'error' && (
          <button onClick={runDetect} className="btn-secondary text-sm">
            Try again
          </button>
        )}
        {state.kind !== 'detecting' && state.kind !== 'connecting' && (
          <button onClick={runDetect} className="text-sm text-grey-40 underline hover:no-underline">
            Refresh
          </button>
        )}
      </div>

      {showInstall && state.kind === 'not_installed' && (
        <div className="mt-4 rounded-[8px] border border-surface-border bg-surface-weak p-4 text-sm text-grey-15 space-y-2">
          <p className="font-medium">Install the unpacked extension</p>
          <ol className="list-decimal list-inside space-y-1 text-grey-40">
            <li>
              Download from{' '}
              <a
                href="https://github.com/goscha01/hirefunnel-meet-extension"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline text-grey-15"
              >
                github.com/goscha01/hirefunnel-meet-extension
              </a>{' '}
              (clone or download zip).
            </li>
            <li>If zipped, extract to a folder you won&apos;t move.</li>
            <li>Open <code className="bg-white px-1 rounded">chrome://extensions</code>.</li>
            <li>Toggle <strong>Developer mode</strong> on (top-right).</li>
            <li>Click <strong>Load unpacked</strong> and select the extension folder.</li>
            <li>Reload this Settings page — the card will auto-connect.</li>
          </ol>
        </div>
      )}
    </div>
  )
}
