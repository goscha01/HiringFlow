'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, businessName }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Registration failed')
      setLoading(false)
      return
    }

    // Auto-login after registration
    const result = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (result?.error) setError('Account created but login failed. Please sign in.')
    else { router.push('/dashboard/flows'); router.refresh() }
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
            <h1 className="text-2xl font-semibold text-grey-15 text-center mb-2">Create Account</h1>
            <p className="text-grey-35 text-center mb-8">Start your hiring funnel in minutes</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-[8px] text-sm border border-red-200">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Business Name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 text-grey-15 placeholder-grey-50"
                  placeholder="Your company name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 text-grey-15 placeholder-grey-50"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 text-grey-15 placeholder-grey-50"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-grey-20 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 text-grey-15 placeholder-grey-50"
                  placeholder="Min 8 characters"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password || !businessName}
                className="w-full btn-primary py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <p className="text-center text-grey-40 text-sm mt-6">
              Already have an account? <Link href="/login" className="text-brand-500 hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
