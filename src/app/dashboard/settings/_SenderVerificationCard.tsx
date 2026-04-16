'use client'

import { useEffect, useState } from 'react'

interface DomainStatus {
  senderEmail: string | null
  senderName: string | null
  senderDomain: string | null
  senderDomainId: string | null
  validated: boolean
  cnames: Array<{ host: string; value: string; purpose: string; valid?: boolean }>
  live: { valid: boolean } | null
}

export function SenderVerificationCard() {
  const [status, setStatus] = useState<DomainStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [domain, setDomain] = useState('')
  const [subdomain, setSubdomain] = useState('em')
  const [senderEmail, setSenderEmail] = useState('')
  const [senderName, setSenderName] = useState('')
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copiedHost, setCopiedHost] = useState<string | null>(null)

  const refresh = async () => {
    const r = await fetch('/api/workspace/domain')
    if (r.ok) {
      const d: DomainStatus = await r.json()
      setStatus(d)
      if (d.senderDomain && !domain) setDomain(d.senderDomain)
      if (d.senderEmail && !senderEmail) setSenderEmail(d.senderEmail)
      if (d.senderName && !senderName) setSenderName(d.senderName)
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const submit = async () => {
    setError(''); setNotice('')
    if (!domain || !senderEmail || !senderName) {
      setError('Domain, sender email, and sender name are all required')
      return
    }
    setSaving(true)
    const res = await fetch('/api/workspace/domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, subdomain, senderEmail, senderName }),
    })
    setSaving(false)
    const data = await res.json()
    if (res.ok) {
      setNotice('Domain registered with SendGrid. Add the CNAME records below to your DNS, then click Validate.')
      setShowSetup(false)
      refresh()
    } else {
      setError(data.error || 'Failed to register domain')
    }
  }

  const validate = async () => {
    setError(''); setNotice('')
    setValidating(true)
    const res = await fetch('/api/workspace/domain/validate', { method: 'POST' })
    setValidating(false)
    const data = await res.json()
    if (data.valid) {
      setNotice('Domain validated! Emails will now send from your address.')
    } else if (res.ok) {
      setNotice('Not validated yet — DNS may still be propagating. Try again in a few minutes.')
    } else {
      setError(data.error || 'Validation failed')
    }
    refresh()
  }

  const updateFrom = async () => {
    setError(''); setNotice('')
    const res = await fetch('/api/workspace/domain', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderEmail, senderName }),
    })
    const data = await res.json()
    if (res.ok) {
      setNotice('Sender info updated.')
      refresh()
    } else {
      setError(data.error || 'Failed to update')
    }
  }

  const remove = async () => {
    if (!confirm('Remove domain authentication? Emails will fall back to the default HireFunnel sender.')) return
    await fetch('/api/workspace/domain', { method: 'DELETE' })
    setNotice('Domain removed.')
    refresh()
  }

  const copy = (text: string, host: string) => {
    navigator.clipboard.writeText(text)
    setCopiedHost(host)
    setTimeout(() => setCopiedHost(null), 1500)
  }

  if (loading) return <div className="text-sm text-grey-40">Loading…</div>

  const hasDomain = !!status?.senderDomainId
  const validated = !!status?.validated

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-grey-15">Send from your own domain</h3>
        {validated ? (
          <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">Verified</span>
        ) : hasDomain ? (
          <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">Pending DNS</span>
        ) : (
          <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-grey-40 font-medium">Using default</span>
        )}
      </div>
      <p className="text-sm text-grey-40 mb-4">
        By default, automated emails are sent from <code className="bg-surface px-1 rounded">noreply@hirefunnel.app</code>. Authenticate your domain once and every address on it (<code className="bg-surface px-1 rounded">info@</code>, <code className="bg-surface px-1 rounded">hiring@</code>, etc.) becomes available as a sender.
      </p>

      {error && <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-[8px]">{error}</div>}
      {notice && <div className="mb-3 p-3 bg-blue-50 text-blue-700 text-sm rounded-[8px]">{notice}</div>}

      {!hasDomain && !showSetup && (
        <button onClick={() => setShowSetup(true)} className="btn-primary text-sm">Authenticate my domain</button>
      )}

      {!hasDomain && showSetup && (
        <div className="bg-surface rounded-[8px] p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-medium text-grey-20 mb-1">Domain</label>
              <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="spotless.homes" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
              <p className="text-xs text-grey-40 mt-1">Just the domain — no https://, no paths.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-grey-20 mb-1">Subdomain <span className="text-grey-40 font-normal">(avoids conflicts with existing DKIM from Outlook, Google, Wix, etc.)</span></label>
              <input type="text" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="em" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
              <p className="text-xs text-grey-40 mt-1">SendGrid&apos;s DNS records will live under <code className="bg-white px-1 rounded">{subdomain || 'em'}.{domain || 'yourdomain.com'}</code> — recommended if your domain already sends mail via another provider.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-grey-20 mb-1">Sender email</label>
                <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="hiring@yourdomain.com" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-grey-20 mb-1">From name</label>
                <input type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Your Hiring Team" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={submit} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
              {saving ? 'Registering…' : 'Register with SendGrid'}
            </button>
            <button onClick={() => setShowSetup(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {hasDomain && (
        <div className="space-y-4">
          <div className="bg-surface rounded-[8px] p-4">
            <div className="grid grid-cols-3 gap-4 text-sm mb-3">
              <div>
                <div className="text-xs text-grey-40">Domain</div>
                <div className="font-medium text-grey-15">{status?.senderDomain}</div>
              </div>
              <div>
                <div className="text-xs text-grey-40">From email</div>
                <div className="font-medium text-grey-15">{status?.senderEmail || <span className="text-grey-40">not set</span>}</div>
              </div>
              <div>
                <div className="text-xs text-grey-40">From name</div>
                <div className="font-medium text-grey-15">{status?.senderName || <span className="text-grey-40">not set</span>}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder={`hiring@${status?.senderDomain}`} className="px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
              <input type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="From name" className="px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={updateFrom} className="btn-secondary text-xs">Update sender</button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-grey-15">DNS records to add</h4>
              {validated && <span className="text-xs text-green-700">✓ All records verified</span>}
            </div>
            <p className="text-xs text-grey-40 mb-3">
              Add these CNAME records to your DNS provider (GoDaddy, Cloudflare, Namecheap, etc.). If you use Cloudflare, set the <span className="font-medium">proxy status to DNS only (grey cloud)</span>, not proxied. DNS propagation takes 5-30 minutes.
            </p>
            <div className="border border-surface-border rounded-[8px] overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-grey-40">Type</th>
                    <th className="px-3 py-2 text-left font-medium text-grey-40">Host / Name</th>
                    <th className="px-3 py-2 text-left font-medium text-grey-40">Value / Points to</th>
                    <th className="px-3 py-2 text-left font-medium text-grey-40">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {status?.cnames.map((c) => (
                    <tr key={c.host}>
                      <td className="px-3 py-2 font-mono">CNAME</td>
                      <td className="px-3 py-2">
                        <div className="font-mono text-grey-15">{c.host}</div>
                        <button onClick={() => copy(c.host, c.host + '-h')} className="text-[10px] text-brand-500 hover:underline">
                          {copiedHost === c.host + '-h' ? 'Copied!' : 'Copy'}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-mono text-grey-15 break-all">{c.value}</div>
                        <button onClick={() => copy(c.value, c.host + '-v')} className="text-[10px] text-brand-500 hover:underline">
                          {copiedHost === c.host + '-v' ? 'Copied!' : 'Copy'}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        {c.valid ? (
                          <span className="text-green-700">✓ Valid</span>
                        ) : (
                          <span className="text-amber-700">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={validate} disabled={validating} className="btn-primary text-sm disabled:opacity-50">
              {validating ? 'Checking DNS…' : 'Check validation'}
            </button>
            <button onClick={remove} className="btn-secondary text-sm text-red-600">Remove domain</button>
          </div>
        </div>
      )}
    </div>
  )
}
