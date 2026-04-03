'use client'

import { useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (result?.error) { setError('Invalid email or password'); return }
    // Check session to route super admins to platform admin
    const session = await getSession()
    const isSuperAdmin = (session?.user as any)?.isSuperAdmin
    router.push(isSuperAdmin ? '/platform-admin' : '/admin/flows')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Top banner */}
      <div className="bg-brand-500 text-white text-center py-3 text-sm">
        HireFunnel — Application Flows & Training Platform
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[440px]">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-[54px] h-[54px] bg-brand-500 rounded-[8px] flex items-center justify-center">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
              </svg>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-surface-border p-10">
            <h1 className="text-2xl font-semibold text-grey-15 text-center mb-2">Welcome Back</h1>
            <p className="text-grey-35 text-center mb-8">Sign in to your HireFunnel account</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-[8px] text-sm border border-red-200">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-grey-20 mb-1.5">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-grey-15 placeholder-grey-50"
                  placeholder="admin@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-grey-20 mb-1.5">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-grey-15 placeholder-grey-50"
                  placeholder="Enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>

          <p className="text-center text-grey-40 text-sm mt-4">
            Don&apos;t have an account? <Link href="/register" className="text-brand-500 hover:underline">Create one</Link>
          </p>
          <p className="text-center text-grey-40 text-sm mt-2">
            &copy; {new Date().getFullYear()} HireFunnel. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
