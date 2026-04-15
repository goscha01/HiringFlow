'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'

function ResetPasswordInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''

  const [validState, setValidState] = useState<'checking' | 'valid' | 'invalid'>('checking')
  const [invalidReason, setInvalidReason] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) { setValidState('invalid'); setInvalidReason('missing'); return }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.valid) setValidState('valid')
        else { setValidState('invalid'); setInvalidReason(d.reason || 'invalid') }
      })
      .catch(() => { setValidState('invalid'); setInvalidReason('network') })
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    setLoading(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setDone(true)
      setTimeout(() => router.push('/login'), 2000)
    } else {
      setError(data.error || 'Reset failed')
    }
  }

  const invalidMessage = {
    missing: 'No reset token was provided.',
    invalid: 'This reset link is invalid.',
    used: 'This reset link has already been used.',
    expired: 'This reset link has expired. Request a new one.',
    network: 'Could not verify the link. Please try again.',
  }[invalidReason] || 'Invalid link.'

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="bg-brand-500 text-white text-center py-3 text-sm">
        HireFunnel — Application Flows & Training Platform
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[440px]">
          <div className="flex justify-center mb-8">
            <div className="w-[54px] h-[54px] bg-brand-500 rounded-[8px] flex items-center justify-center">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
              </svg>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-surface-border p-10">
            {validState === 'checking' && (
              <p className="text-center text-grey-35">Verifying link…</p>
            )}
            {validState === 'invalid' && (
              <>
                <h1 className="text-2xl font-semibold text-grey-15 text-center mb-2">Link unavailable</h1>
                <p className="text-grey-35 text-center mb-6">{invalidMessage}</p>
                <Link href="/forgot-password" className="block text-center btn-primary py-3">Request new link</Link>
              </>
            )}
            {validState === 'valid' && !done && (
              <>
                <h1 className="text-2xl font-semibold text-grey-15 text-center mb-2">Set a new password</h1>
                <p className="text-grey-35 text-center mb-6">Choose a strong password of at least 8 characters.</p>
                <form onSubmit={submit} className="space-y-5">
                  {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-[8px] text-sm border border-red-200">{error}</div>}
                  <div>
                    <label className="block text-sm font-medium text-grey-20 mb-1.5">New password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="w-full px-4 py-3 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 text-grey-15" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-grey-20 mb-1.5">Confirm password</label>
                    <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} className="w-full px-4 py-3 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 text-grey-15" />
                  </div>
                  <button type="submit" disabled={loading} className="w-full btn-primary py-3.5 text-base disabled:opacity-50">
                    {loading ? 'Saving…' : 'Save new password'}
                  </button>
                </form>
              </>
            )}
            {validState === 'valid' && done && (
              <>
                <h1 className="text-2xl font-semibold text-grey-15 text-center mb-2">Password updated</h1>
                <p className="text-grey-35 text-center">Redirecting to sign in…</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <ResetPasswordInner />
    </Suspense>
  )
}
