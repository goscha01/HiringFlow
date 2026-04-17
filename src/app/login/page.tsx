/**
 * Sign in — split screen: left form, right testimonial on deep-green gradient.
 * Matches Design/design_handoff_hirefunnel spec (screen 13).
 */

'use client'

import { useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Eyebrow } from '@/components/design'

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
    const session = await getSession()
    const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin
    router.push(isSuperAdmin ? '/platform-admin' : '/dashboard/flows')
    router.refresh()
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: 'var(--bg)' }}>
      {/* LEFT: form */}
      <div className="flex flex-col justify-center px-6 py-10 lg:px-16">
        <div className="w-full max-w-[420px] mx-auto">
          <div className="flex items-center gap-2.5 mb-10">
            <div
              className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white font-bold text-[17px]"
              style={{ background: 'var(--brand-primary)', boxShadow: 'var(--shadow-brand)' }}
            >
              h
            </div>
            <span className="font-semibold text-[16px] text-ink tracking-[-0.01em]">HireFunnel</span>
          </div>

          <Eyebrow size="sm" className="mb-2">Welcome back</Eyebrow>
          <h1 className="text-[28px] font-semibold text-ink tracking-tight2 mb-1">Sign in</h1>
          <p className="text-[14px] text-grey-35 mb-8">Hire people, not résumés.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="px-3 py-2.5 rounded-[10px] text-[12px] font-medium" style={{ background: 'var(--danger-bg)', color: 'var(--danger-fg)' }}>
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="eyebrow block mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-surface-border rounded-[10px] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-[color:var(--brand-primary)] text-ink text-[14px] bg-white"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="eyebrow">Password</label>
                <Link href="/forgot-password" className="text-[11px] font-mono uppercase text-[color:var(--brand-primary)] hover:underline" style={{ letterSpacing: '0.08em' }}>Forgot?</Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-surface-border rounded-[10px] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-[color:var(--brand-primary)] text-ink text-[14px] bg-white"
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full !py-3">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-surface-divider flex justify-between text-[12px] text-grey-35">
            <span>
              Don&apos;t have an account? <Link href="/register" className="text-ink hover:text-[color:var(--brand-primary)] font-medium">Create one</Link>
            </span>
            <span className="font-mono" style={{ letterSpacing: '0.04em' }}>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>

      {/* RIGHT: testimonial on deep-green gradient */}
      <div
        className="hidden lg:flex flex-col justify-between p-16 text-white relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1a3a2e 0%, #2a5a46 60%, #3a7a5e 100%)',
        }}
      >
        <div className="absolute inset-0 opacity-[0.08]" style={{
          background: `repeating-linear-gradient(45deg, rgba(255,255,255,0.3) 0 1px, transparent 1px 28px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.3) 0 1px, transparent 1px 28px)`,
        }} />

        <div className="relative">
          <div className="font-mono text-[11px] uppercase text-white/60 mb-1.5" style={{ letterSpacing: '0.12em' }}>
            On HireFunnel
          </div>
          <div className="text-[13px] text-white/70">Built for lean recruiting teams.</div>
        </div>

        <blockquote className="relative max-w-[420px]">
          <div className="text-[34px] font-semibold leading-[1.15] tracking-tight2 text-white mb-5">
            &ldquo;We replaced three tools and cut time-to-hire in half. Everything from sourcing to scheduling happens in one place.&rdquo;
          </div>
          <footer className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center font-semibold text-[13px] text-white">
              MT
            </div>
            <div>
              <div className="text-[13px] font-medium text-white">Maya Thompson</div>
              <div className="text-[12px] text-white/60">Head of People · Northwind</div>
            </div>
          </footer>
        </blockquote>

        <div className="relative font-mono text-[10px] uppercase text-white/40 flex gap-6" style={{ letterSpacing: '0.14em' }}>
          <span>SOC 2</span>
          <span>GDPR</span>
          <span>Encrypted at rest</span>
        </div>
      </div>
    </div>
  )
}
