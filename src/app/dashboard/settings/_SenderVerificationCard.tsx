'use client'

import { useEffect, useState } from 'react'

interface SenderStatus {
  senderEmail: string | null
  senderName: string | null
  senderVerifiedId: string | null
  verified: boolean
  pending: boolean
  address: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  } | null
}

export function SenderVerificationCard() {
  const [status, setStatus] = useState<SenderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('US')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = async () => {
    setLoading(true)
    const r = await fetch('/api/workspace/sender')
    if (r.ok) {
      const d: SenderStatus = await r.json()
      setStatus(d)
      setEmail(d.senderEmail || '')
      setName(d.senderName || '')
      setLine1(d.address?.line1 || '')
      setLine2(d.address?.line2 || '')
      setCity(d.address?.city || '')
      setState(d.address?.state || '')
      setZip(d.address?.zip || '')
      setCountry(d.address?.country || 'US')
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const submit = async () => {
    setError(''); setNotice('')
    if (!email || !name || !line1 || !city || !state || !zip || !country) {
      setError('All fields except address line 2 are required')
      return
    }
    setSaving(true)
    const res = await fetch('/api/workspace/sender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderEmail: email,
        senderName: name,
        address: { line1, line2, city, state, zip, country },
      }),
    })
    setSaving(false)
    const data = await res.json()
    if (res.ok) {
      setNotice(`Verification email sent to ${email}. Click the link in the email to verify.`)
      setShowForm(false)
      refresh()
    } else {
      setError(data.error || 'Failed to submit')
    }
  }

  const resend = async () => {
    setError(''); setNotice('')
    const res = await fetch('/api/workspace/sender/resend', { method: 'POST' })
    const data = await res.json()
    if (res.ok) setNotice('Verification email resent. Check your inbox.')
    else setError(data.error || 'Failed to resend')
  }

  const remove = async () => {
    if (!confirm('Remove verified sender? Emails will fall back to the default HireFunnel sender.')) return
    await fetch('/api/workspace/sender', { method: 'DELETE' })
    setNotice('Sender removed.')
    refresh()
  }

  if (loading) return <div className="text-sm text-grey-40">Loading sender status…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-grey-15">Send from your own email</h3>
        {status?.verified ? (
          <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">Verified</span>
        ) : status?.pending ? (
          <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">Pending verification</span>
        ) : (
          <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-grey-40 font-medium">Using default</span>
        )}
      </div>
      <p className="text-sm text-grey-40 mb-4">
        By default, automated emails are sent from <code className="bg-surface px-1 rounded">noreply@hirefunnel.app</code>. Verify your own email once and all candidate emails will come from that address instead.
      </p>

      {error && <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-[8px]">{error}</div>}
      {notice && <div className="mb-3 p-3 bg-blue-50 text-blue-700 text-sm rounded-[8px]">{notice}</div>}

      {status?.verified && !showForm && (
        <div className="bg-green-50 border border-green-200 rounded-[8px] p-4 mb-3">
          <div className="text-sm">
            <div className="font-medium text-green-800">{status.senderName} &lt;{status.senderEmail}&gt;</div>
            <div className="text-xs text-green-700 mt-0.5">Emails will be sent from this address.</div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setShowForm(true)} className="text-xs text-grey-35 hover:text-grey-15 underline">Change</button>
            <button onClick={remove} className="text-xs text-red-600 hover:text-red-700 underline">Remove</button>
          </div>
        </div>
      )}

      {status?.pending && !showForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-[8px] p-4 mb-3">
          <div className="text-sm">
            <div className="font-medium text-amber-800">{status.senderName} &lt;{status.senderEmail}&gt;</div>
            <div className="text-xs text-amber-700 mt-1">We sent a verification email to this address. Click the link inside to activate. Until verified, emails still go from the default sender.</div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={resend} className="text-xs text-brand-600 hover:text-brand-700 underline">Resend verification email</button>
            <button onClick={() => setShowForm(true)} className="text-xs text-grey-35 hover:text-grey-15 underline">Change address</button>
            <button onClick={refresh} className="text-xs text-grey-35 hover:text-grey-15 underline">Refresh status</button>
          </div>
        </div>
      )}

      {(!status?.senderVerifiedId || showForm) && (
        <>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn-primary text-sm">Set up my own sender email</button>
          )}
          {showForm && (
            <div className="bg-surface rounded-[8px] p-4 space-y-3">
              <p className="text-xs text-grey-40">
                Anti-spam rules (CAN-SPAM) require a physical mailing address in every automated email. This address will appear in the email footer.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-grey-20 mb-1">From email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hiring@yourcompany.com" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-grey-20 mb-1">From name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Company Hiring Team" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-grey-20 mb-1">Street address</label>
                  <input type="text" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="123 Main St" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-grey-20 mb-1">Suite / unit (optional)</label>
                  <input type="text" value={line2} onChange={(e) => setLine2(e.target.value)} className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-grey-20 mb-1">City</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-grey-20 mb-1">State / region</label>
                  <input type="text" value={state} onChange={(e) => setState(e.target.value)} className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-grey-20 mb-1">ZIP / postal code</label>
                  <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-grey-20 mb-1">Country</label>
                  <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" className="w-full px-3 py-2 border border-surface-border rounded-[6px] text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={submit} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                  {saving ? 'Submitting…' : 'Send verification email'}
                </button>
                <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
