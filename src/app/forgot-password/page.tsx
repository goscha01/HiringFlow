'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    setSent(true)
  }

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
            {sent ? (
              <>
                <h1 className="text-2xl font-semibold text-grey-15 text-center mb-2">Check your email</h1>
                <p className="text-grey-35 text-center mb-6">
                  If an account exists for <span className="font-medium text-grey-15">{email}</span>, we&apos;ve sent a password reset link. It expires in 1 hour.
                </p>
                <Link href="/login" className="block text-center text-sm text-brand-500 hover:underline">Back to sign in</Link>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold text-grey-15 text-center mb-2">Reset password</h1>
                <p className="text-grey-35 text-center mb-8">Enter your email and we&apos;ll send you a reset link</p>
                <form onSubmit={submit} className="space-y-5">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-grey-20 mb-1.5">Email</label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 text-grey-15"
                      placeholder="you@example.com"
                    />
                  </div>
                  <button type="submit" disabled={loading} className="w-full btn-primary py-3.5 text-base disabled:opacity-50">
                    {loading ? 'Sending…' : 'Send reset link'}
                  </button>
                  <Link href="/login" className="block text-center text-sm text-grey-40 hover:text-grey-15">Back to sign in</Link>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
