'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

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
          if (redirectUrl) {
            setTimeout(() => { window.location.href = redirectUrl }, 3000)
          }
        }
      })
      .catch(() => {})
  }, [slug])

  const bgImage = branding?.endScreenImage || branding?.startScreenImage
  const primary = branding?.colors?.primary
  const logo = branding?.logo
  const logoCfg = branding?.logoSettings?.endScreen
  const showLogo = logo && (logoCfg?.enabled ?? true)
  const logoPos = logoCfg?.position || { x: 50, y: 15 }
  const cta = branding?.endScreen

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        background: bgImage ? `url(${bgImage}) center/cover` : 'linear-gradient(135deg, #FF9500 0%, #EA8500 100%)',
      }}
    >
      {showLogo && (
        <img
          src={logo}
          alt={flowName || 'Logo'}
          className="absolute max-h-16 max-w-[200px] object-contain -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${logoPos.x}%`, top: `${logoPos.y}%` }}
        />
      )}
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: primary ? `${primary}1A` : '#DCFCE7' }}
        >
          <svg
            className="w-10 h-10"
            style={{ color: primary || '#16A34A' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">All Done!</h1>

        <p className="text-gray-600 mb-6">{endMessage}</p>

        {cta?.ctaText && cta?.ctaUrl ? (
          <a
            href={cta.ctaUrl}
            className="inline-block w-full text-white py-3 px-6 rounded-[8px] font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: primary || '#FF9500' }}
          >
            {cta.ctaText}
          </a>
        ) : (
          <p className="text-sm text-gray-500">You can close this window now.</p>
        )}
      </div>
    </div>
  )
}
