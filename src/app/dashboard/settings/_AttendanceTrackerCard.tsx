'use client'

import { useEffect, useState } from 'react'

/**
 * Stable extension ID computed from the manifest's `key` field.
 * Generated once via openssl + sha256 (see hirefunnel-meet-extension repo).
 * Pinning the ID here lets the dashboard call
 * chrome.runtime.sendMessage(EXTENSION_ID, ...) without the user having
 * to copy/paste it from chrome://extensions.
 */
const EXTENSION_ID = 'eijbbbhihnoejaegheikoebdpmmjlmbe'

type ExtensionState =
  | { kind: 'detecting' }
  | { kind: 'not_installed' }
  | { kind: 'installed_disconnected'; version: string }
  | { kind: 'connected'; version: string; lastUsedAt: string | null; prefix: string }

type TokenStatus = {
  connected: boolean
  apiBaseUrl: string
  workspaceId: string
  token: { id: string; prefix: string; createdAt: string; lastUsedAt: string | null } | null
}

interface ChromeRuntime {
  sendMessage(
    extensionId: string,
    msg: unknown,
    cb: (res: { ok: boolean; version?: string; reason?: string } | undefined) => void,
  ): void
  lastError?: { message?: string }
}

function getChromeRuntime(): ChromeRuntime | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { chrome?: { runtime?: ChromeRuntime } }
  return w.chrome?.runtime ?? null
}

function pingExtension(): Promise<{ installed: boolean; version?: string }> {
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
        // chrome.runtime.lastError fires when the target extension isn't
        // installed, isn't reachable, or hasn't whitelisted this origin.
        // Touching it (and ignoring) is required to silence Chrome's
        // "unchecked runtime.lastError" warning in the console.
        const err = runtime.lastError
        if (err || !res?.ok) {
          resolve({ installed: false })
          return
        }
        resolve({ installed: true, version: res.version })
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
    } catch {
      resolve(false)
    }
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
    } catch {
      resolve(false)
    }
  })
}

export function AttendanceTrackerCard() {
  const [state, setState] = useState<ExtensionState>({ kind: 'detecting' })
  const [busy, setBusy] = useState<'connect' | 'disconnect' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInstall, setShowInstall] = useState(false)

  const refresh = async () => {
    setError(null)
    const [ping, status] = await Promise.all([
      pingExtension(),
      fetch('/api/integrations/extension/token').then(r => r.json() as Promise<TokenStatus>).catch(() => null),
    ])
    if (!ping.installed) {
      setState({ kind: 'not_installed' })
      return
    }
    const version = ping.version || '?'
    if (status?.connected && status.token) {
      setState({
        kind: 'connected',
        version,
        lastUsedAt: status.token.lastUsedAt,
        prefix: status.token.prefix,
      })
    } else {
      setState({ kind: 'installed_disconnected', version })
    }
  }

  useEffect(() => { refresh() }, [])

  const connect = async () => {
    setBusy('connect')
    setError(null)
    try {
      const res = await fetch('/api/integrations/extension/token', { method: 'POST' })
      const data = await res.json() as { ok: boolean; apiBaseUrl: string; workspaceId: string; token: string; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to issue extension token')
        return
      }
      const handed = await sendConnect({
        apiBaseUrl: data.apiBaseUrl,
        token: data.token,
        workspaceId: data.workspaceId,
      })
      if (!handed) {
        // The token was minted but the extension didn't acknowledge.
        // Revoke it so we don't leak an unused active token.
        await fetch('/api/integrations/extension/token', { method: 'DELETE' }).catch(() => {})
        setError('Could not reach the extension. Make sure it is installed and reload the page.')
        return
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed')
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect HireFunnel Meet Tracker? Live attendance tracking will stop until reconnected.')) return
    setBusy('disconnect')
    setError(null)
    try {
      await sendDisconnect()
      await fetch('/api/integrations/extension/token', { method: 'DELETE' })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed')
    } finally {
      setBusy(null)
    }
  }

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
          {state.kind === 'not_installed' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-grey-40 font-medium">Not installed</span>
          )}
          {state.kind === 'installed_disconnected' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">Not connected</span>
          )}
          {state.kind === 'connected' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">
              Connected · v{state.version}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 px-3 py-2 rounded-[8px] text-sm bg-red-50 text-red-700">
          {error}
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
          <button
            onClick={() => setShowInstall((v) => !v)}
            className="btn-primary text-sm"
          >
            {showInstall ? 'Hide install steps' : 'Install Chrome Extension'}
          </button>
        )}
        {state.kind === 'installed_disconnected' && (
          <button onClick={connect} disabled={busy === 'connect'} className="btn-primary text-sm disabled:opacity-50">
            {busy === 'connect' ? 'Connecting…' : 'Connect'}
          </button>
        )}
        {state.kind === 'connected' && (
          <>
            <button onClick={connect} disabled={busy === 'connect'} className="btn-secondary text-sm disabled:opacity-50">
              {busy === 'connect' ? 'Rotating…' : 'Rotate token'}
            </button>
            <button onClick={disconnect} disabled={busy === 'disconnect'} className="btn-secondary text-sm disabled:opacity-50">
              {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        )}
        <button onClick={refresh} className="text-sm text-grey-40 underline hover:no-underline">
          Refresh
        </button>
      </div>

      {showInstall && state.kind === 'not_installed' && (
        <div className="mt-4 rounded-[8px] border border-surface-border bg-surface-weak p-4 text-sm text-grey-15 space-y-2">
          <p className="font-medium">Install the unpacked extension</p>
          <ol className="list-decimal list-inside space-y-1 text-grey-40">
            <li>
              Download the extension from{' '}
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
            <li>Reload this Settings page; this card will switch to <strong>Not connected</strong>.</li>
            <li>Click <strong>Connect</strong> to provision the workspace token.</li>
          </ol>
        </div>
      )}
    </div>
  )
}
