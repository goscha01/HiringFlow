'use client'

/**
 * Anonymous-visitor intake form. Collects name+email (and optional phone),
 * then exchanges that for a signed booking token via /start. On success the
 * page reloads with ?t=<token> and the normal slot picker takes over.
 */

import { useState } from 'react'

interface Props {
  configId: string
  workspaceName: string
  workspaceLogo: string | null
  configName: string
  durationMinutes: number | null
}

export function IntakeForm(props: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onContinue() {
    setError(null)
    if (!name.trim()) { setError('Please enter your name'); return }
    if (!email.trim()) { setError('Please enter your email'); return }
    setSubmitting(true)
    try {
      const r = await fetch(`/api/public/booking/${props.configId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (r.status === 429) throw new Error('Too many attempts — try again in a few minutes.')
        throw new Error(data.message || data.error || 'Could not start booking')
      }
      window.location.href = `/book/${props.configId}?t=${encodeURIComponent(data.token)}`
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '"Inter", "Be Vietnam Pro", system-ui, -apple-system, sans-serif', color: '#262626' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white shadow-sm">
          <header className="px-8 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5">
            {props.workspaceLogo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={props.workspaceLogo} alt={props.workspaceName} className="w-7 h-7 rounded-full object-cover" />
              : <div className="w-7 h-7 rounded-full bg-[#FF9500] text-white flex items-center justify-center text-[12px] font-medium">{(props.workspaceName || '?').charAt(0).toUpperCase()}</div>}
            <div className="text-[13px] text-[#666]">{props.workspaceName}</div>
          </header>
          <div className="px-10 py-12 max-w-md mx-auto">
            <h1 className="text-[24px] font-semibold mb-1">{props.configName}</h1>
            <p className="text-[14px] text-[#666] mb-6">
              {props.durationMinutes ? `${props.durationMinutes} min · Google Meet` : 'Google Meet'}
            </p>
            <p className="text-[14px] text-[#444] mb-6">Tell us a bit about you, then pick a time.</p>
            <div className="space-y-3">
              <Field label="Name *" value={name} onChange={setName} autoFocus />
              <Field label="Email *" type="email" value={email} onChange={setEmail} />
              <Field label="Phone (optional)" value={phone} onChange={setPhone} />
            </div>
            {error && <div className="mt-4 text-[13px] text-red-600">{error}</div>}
            <button
              onClick={onContinue}
              disabled={submitting}
              className="mt-6 w-full bg-[#FF9500] text-white py-2.5 rounded-md font-medium hover:bg-[#E68500] transition-colors disabled:opacity-50"
            >
              {submitting ? 'Loading…' : 'Continue'}
            </button>
            <p className="mt-4 text-[11px] text-[#888]">
              By continuing you agree we&apos;ll create a calendar invite and send a confirmation email.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', autoFocus }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoFocus?: boolean }) {
  return (
    <div>
      <label className="text-[12px] text-[#444] block mb-1">{label}</label>
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-[#E5E7EB] rounded-md text-[14px] text-[#262626] focus:outline-none focus:border-[#FF9500]"
      />
    </div>
  )
}
