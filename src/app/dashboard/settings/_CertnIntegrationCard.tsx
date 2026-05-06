'use client'

import { useEffect, useState } from 'react'

interface IntegrationStatus {
  configured: boolean
  integration: {
    id: string
    region: 'CA' | 'UK' | 'AU'
    isActive: boolean
    defaultCheckTypes: Record<string, Record<string, unknown>>
    inviteExpiryDays: number
    hasWebhookSecret: boolean
    createdAt: string
    updatedAt: string
  } | null
  webhookUrl: string
}

const REGION_OPTIONS: Array<{ value: 'CA' | 'UK' | 'AU'; label: string; host: string; portal: string }> = [
  { value: 'CA', label: 'North America',                   host: 'api.ca.certn.co', portal: 'https://client.certn.co/ca/login' },
  { value: 'UK', label: 'Europe / Middle East / Africa',   host: 'api.uk.certn.co', portal: 'https://client.certn.co/uk/login' },
  { value: 'AU', label: 'Asia Pacific',                    host: 'api.au.certn.co', portal: 'https://client.certn.co/au/login' },
]

const COMMON_CHECK_TYPES: Array<{ value: string; label: string }> = [
  { value: 'IDENTITY_VERIFICATION_1', label: 'Identity Verification' },
  { value: 'CRIMINAL_RECORD_REPORT_1', label: 'Criminal Record (umbrella)' },
  { value: 'CREDIT_REPORT_1', label: 'Credit Report (umbrella)' },
  { value: 'EMPLOYMENT_VERIFICATION_1', label: 'Employment Verification' },
  { value: 'EDUCATION_VERIFICATION_1', label: 'Education Verification' },
  { value: 'REFERENCE_CHECK_1', label: 'Reference Check' },
  { value: 'ADVERSE_MEDIA_1', label: 'Adverse Media' },
]

export function CertnIntegrationCard() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // form state
  const [apiKey, setApiKey] = useState('')
  const [region, setRegion] = useState<'CA' | 'UK' | 'AU'>('CA')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [inviteExpiryDays, setInviteExpiryDays] = useState(7)
  const [checkTypes, setCheckTypes] = useState<Set<string>>(new Set(['IDENTITY_VERIFICATION_1']))
  const [copied, setCopied] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/integrations/certn')
      const d = await r.json() as IntegrationStatus
      setStatus(d)
      if (d.integration) {
        setRegion(d.integration.region)
        setInviteExpiryDays(d.integration.inviteExpiryDays)
        const types = Object.keys(d.integration.defaultCheckTypes || {})
        if (types.length > 0) setCheckTypes(new Set(types))
      }
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    setBanner(null)
    try {
      const defaultCheckTypes = Object.fromEntries(Array.from(checkTypes).map(k => [k, {}]))
      const body: Record<string, unknown> = {
        region,
        defaultCheckTypes,
        inviteExpiryDays,
      }
      if (apiKey.trim()) body.apiKey = apiKey.trim()
      if (webhookSecret.trim()) body.webhookSecret = webhookSecret.trim()

      const r = await fetch('/api/integrations/certn', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        setBanner({ type: 'error', text: err.error || 'Save failed' })
        return
      }
      setBanner({ type: 'success', text: 'Saved.' })
      setEditing(false)
      setApiKey('')
      setWebhookSecret('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setBanner(null)
    try {
      const r = await fetch('/api/integrations/certn?action=test', { method: 'POST' })
      const d = await r.json() as { ok: boolean; region?: string; error?: string }
      if (d.ok) setBanner({ type: 'success', text: `Connected to Certn ${d.region} region.` })
      else setBanner({ type: 'error', text: `Test failed: ${d.error || 'Unknown error'}` })
    } finally {
      setTesting(false)
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect Certn? Your API key, webhook secret, and default check types will be removed. Existing background checks already in flight will continue.')) return
    await fetch('/api/integrations/certn', { method: 'DELETE' })
    setEditing(false)
    setBanner({ type: 'success', text: 'Disconnected.' })
    await load()
  }

  function copyWebhookUrl() {
    if (!status?.webhookUrl) return
    navigator.clipboard.writeText(status.webhookUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (loading) {
    return (
      <div className="bg-white rounded-[12px] border border-surface-border p-6">
        <div className="text-sm text-grey-40">Loading Certn integration…</div>
      </div>
    )
  }

  const configured = !!status?.configured
  const showForm = editing || !configured
  const regionMeta = REGION_OPTIONS.find((o) => o.value === (status?.integration?.region || region))

  return (
    <div className="bg-white rounded-[12px] border border-surface-border p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-grey-15">Certn — Background Checks</h3>
          <p className="text-sm text-grey-40 mt-1">
            Run identity, criminal, credit, employment, education, and reference checks on candidates via Certn. Results take 1–2 days and fire the Background Check automation triggers.
          </p>
        </div>
        {configured && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status!.integration!.isActive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {status!.integration!.isActive ? 'Connected' : 'Disabled'}
          </span>
        )}
      </div>

      {banner && (
        <div className={`mb-4 px-3 py-2 rounded-[8px] text-sm border ${banner.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {banner.text}
        </div>
      )}

      {/* Configured but not editing — summary */}
      {configured && !editing && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface rounded-[8px] p-3">
              <div className="text-[11px] uppercase tracking-wide text-grey-40 mb-1">Region</div>
              <div className="text-sm font-medium text-grey-15">{regionMeta?.label || status!.integration!.region}</div>
              <div className="text-[11px] text-grey-50 font-mono mt-0.5">{regionMeta?.host}</div>
            </div>
            <div className="bg-surface rounded-[8px] p-3">
              <div className="text-[11px] uppercase tracking-wide text-grey-40 mb-1">Invite expiry</div>
              <div className="text-sm font-medium text-grey-15">{status!.integration!.inviteExpiryDays} days</div>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-grey-40 mb-1.5">Default check types</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(status!.integration!.defaultCheckTypes || {}).length === 0
                ? <span className="text-sm text-grey-40">None — set defaults below to enable automation-ordered checks.</span>
                : Object.keys(status!.integration!.defaultCheckTypes).map((t) => (
                    <span key={t} className="text-[11px] px-2 py-0.5 rounded-[6px] bg-brand-50 text-brand-700 font-mono">{t}</span>
                  ))
              }
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-grey-40 mb-1.5">Webhook URL — paste this into Certn → Integrations → Webhooks</div>
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 bg-surface rounded-[8px] text-xs text-grey-15 font-mono break-all">{status!.webhookUrl}</code>
              <button onClick={copyWebhookUrl} className="px-3 py-2 text-xs font-medium border border-surface-border rounded-[8px] hover:bg-surface">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {!status!.integration!.hasWebhookSecret && (
              <p className="text-[11px] text-amber-700 mt-1.5">⚠ No signing secret configured. Webhooks are accepted unsigned right now — paste the secret Certn shows you after registering this URL.</p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setEditing(true)} className="text-sm px-4 py-2 border border-surface-border rounded-[8px] hover:bg-surface font-medium">
              Edit
            </button>
            <button onClick={test} disabled={testing} className="text-sm px-4 py-2 border border-surface-border rounded-[8px] hover:bg-surface font-medium disabled:opacity-50">
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button onClick={disconnect} className="text-sm px-4 py-2 text-red-600 hover:bg-red-50 rounded-[8px] font-medium ml-auto">
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Edit / first-time setup form */}
      {showForm && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-grey-20 mb-1.5">
              API key {configured ? <span className="text-grey-50 font-normal">(leave blank to keep current)</span> : <span className="text-red-500">*</span>}
            </label>
            <div className="bg-brand-50 border border-brand-200 rounded-[8px] p-3 mb-2 text-[11px] text-grey-20 leading-relaxed">
              <div className="font-medium text-brand-700 mb-1">How to get your API key</div>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>
                  Sign in to your{' '}
                  <a
                    href={REGION_OPTIONS.find((r) => r.value === region)?.portal || 'https://client.certn.co/ca/login'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:text-brand-700 underline font-medium"
                  >
                    Certn Client Portal ({region})
                  </a>
                </li>
                <li>Open <span className="font-medium">Settings → Integrations → API Keys</span></li>
                <li>Click <span className="font-medium">Create new key</span> and copy it (shown once)</li>
                <li>Paste the key below</li>
              </ol>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={configured ? '••••••••••••' : 'Paste your Certn API key'}
              autoComplete="off"
              className="w-full px-3 py-2 border border-surface-border rounded-[8px] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-[11px] text-grey-50 mt-1">
              Keys expire after 365 days. Multiple active keys are allowed, so rotation has no downtime.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-grey-20 mb-1.5">Region <span className="text-red-500">*</span></label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as 'CA' | 'UK' | 'AU')}
              className="w-full px-3 py-2 border border-surface-border rounded-[8px] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {REGION_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label} ({r.host})</option>
              ))}
            </select>
            <p className="text-[11px] text-grey-50 mt-1">
              API keys are region-scoped — pick the region your Certn account lives in. Wrong region returns 401.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-grey-20 mb-1.5">Default check types</label>
            <div className="flex flex-wrap gap-2">
              {COMMON_CHECK_TYPES.map((c) => {
                const on = checkTypes.has(c.value)
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      const next = new Set(checkTypes)
                      if (on) next.delete(c.value); else next.add(c.value)
                      setCheckTypes(next)
                    }}
                    className={`text-xs px-2.5 py-1.5 rounded-[8px] border font-medium ${
                      on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35 hover:bg-surface'
                    }`}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-grey-50 mt-1.5">
              These run when an automation step orders a check. Umbrella checks (Criminal/Credit) auto-pick the regional child check based on the applicant's address.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-grey-20 mb-1.5">Invite expiry (days)</label>
            <input
              type="number"
              min={1}
              max={90}
              value={inviteExpiryDays}
              onChange={(e) => setInviteExpiryDays(Number(e.target.value) || 7)}
              className="w-32 px-3 py-2 border border-surface-border rounded-[8px] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-[11px] text-grey-50 mt-1">After this many days, abandoned invites expire and fire the Needs Review trigger.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-grey-20 mb-1.5">
              Webhook signing secret {configured && status?.integration?.hasWebhookSecret ? <span className="text-grey-50 font-normal">(leave blank to keep current)</span> : null}
            </label>
            <input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="Paste the secret Certn shows after webhook registration"
              autoComplete="off"
              className="w-full px-3 py-2 border border-surface-border rounded-[8px] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-[11px] text-grey-50 mt-1">
              After saving the API key, copy the webhook URL we generate, register it in Certn → Integrations → Webhooks, and paste the secret Certn returns here. Without this, webhook payloads are not HMAC-verified.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={save}
              disabled={saving || (!configured && !apiKey.trim())}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
            >
              {saving ? 'Saving…' : configured ? 'Save changes' : 'Connect Certn'}
            </button>
            {editing && (
              <button onClick={() => { setEditing(false); setApiKey(''); setWebhookSecret(''); setBanner(null) }} className="text-sm px-4 py-2 border border-surface-border rounded-[8px] hover:bg-surface font-medium">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
