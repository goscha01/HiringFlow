/**
 * Thank-you / flow-complete screen. Refreshed to match the warm-surface
 * landing system; success tone uses the design's success palette.
 */

'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Eyebrow } from '@/components/design'

interface EndScreenConfig {
  redirectUrl?: string
  ctaText?: string
  ctaUrl?: string
}

interface Branding {
  endScreenImage?: string
  startScreenImage?: string
  logo?: string
  logoSettings?: { endScreen?: { enabled: boolean; position: { x: number; y: number } } }
  endScreen?: EndScreenConfig
  colors?: { primary?: string }
}

export default function DonePage() {
  const params = useParams()
  const slug = params.slug as string
  const [endMessage, setEndMessage] = useState('Thank you for your participation!')
  const [flowName, setFlowName] = useState('')
  const [branding, setBranding] = useState<Branding | null>(null)

  useEffect(() => {
    fetch(`/api/public/flows/${slug}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setEndMessage(data.endMessage || 'Thank you for your participation!')
          setFlowName(data.name || '')
          setBranding(data.branding || null)
          const redirectUrl = data.branding?.endScreen?.redirectUrl
          if (redirectUrl) setTimeout(() => { window.location.href = redirectUrl }, 3000)
        }
      })
      .catch(() => {})
  }, [slug])

  const bgImage = branding?.endScreenImage || branding?.startScreenImage
  const primary = branding?.colors?.primary || 'var(--brand-primary)'
  const logo = branding?.logo
  const logoCfg = branding?.logoSettings?.endScreen
  const showLogo = logo && (logoCfg?.enabled ?? true)
  const logoPos = logoCfg?.position || { x: 50, y: 15 }
  const cta = branding?.endScreen

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        background: bgImage ? `url(${bgImage}) center/cover` : 'var(--bg)',
      }}
    >
      {!bgImage && (
        <div
          className="absolute inset-0 opacity-[0.6] pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at top left, rgba(255,149,0,0.12), transparent 60%),
              radial-gradient(ellipse at bottom right, rgba(255,149,0,0.08), transparent 55%),
              repeating-linear-gradient(135deg, rgba(26,24,21,0.03) 0 1px, transparent 1px 32px)`,
          }}
        />
      )}

      {showLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={flowName || 'Logo'}
          className="absolute max-h-16 max-w-[200px] object-contain -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${logoPos.x}%`, top: `${logoPos.y}%` }}
        />
      )}

      <div
        className="relative bg-white rounded-[14px] border border-surface-border p-10 max-w-[480px] w-full text-center"
        style={{ boxShadow: 'var(--shadow-raised)' }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: 'var(--success-bg)' }}
        >
          <svg className="w-8 h-8" style={{ color: 'var(--success-fg)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <Eyebrow size="sm" className="mb-2 !text-[color:var(--success-fg)]">All done</Eyebrow>
        <h1 className="text-[26px] font-semibold text-ink mb-2 tracking-tight2">Thanks{flowName ? `, ${flowName} is submitted` : ''}!</h1>

        <p className="text-grey-35 text-[14px] mb-7 leading-relaxed">{endMessage}</p>

        {cta?.ctaText && cta?.ctaUrl ? (
          <a
            href={cta.ctaUrl}
            className="inline-block w-full text-white py-3 px-6 rounded-[10px] font-semibold text-[14px] transition-opacity hover:opacity-90"
            style={{ background: primary }}
          >
            {cta.ctaText}
          </a>
        ) : (
          <div className="font-mono text-[10px] uppercase text-grey-50" style={{ letterSpacing: '0.12em' }}>
            You can close this window
          </div>
        )}
      </div>
    </div>
  )
}
