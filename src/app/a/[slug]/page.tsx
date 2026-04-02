'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface AdData {
  adId: string
  adName: string
  source: string
  campaign: string | null
  flow: {
    id: string
    name: string
    slug: string
    startMessage: string
    branding: Record<string, unknown> | null
    startStepId: string | null
  }
}

export default function AdEntryPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [ad, setAd] = useState<AdData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    fetch(`/api/public/ads/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAd(d); else setError('Ad not found or inactive'); setLoading(false) })
      .catch(() => { setError('Failed to load'); setLoading(false) })
  }, [slug])

  const handleStart = async () => {
    if (!ad) return
    setStarting(true)

    const res = await fetch('/api/public/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flowSlug: ad.flow.slug,
        candidateName: name || null,
        candidateEmail: email || null,
        candidatePhone: phone || null,
        // Attribution from Ad
        adId: ad.adId,
        source: ad.source,
        campaign: ad.campaign,
      }),
    })

    if (res.ok) {
      const data = await res.json()
      router.replace(`/f/${ad.flow.slug}/s/${data.id}`)
    } else {
      setError('Failed to start')
      setStarting(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FF9500]"><div className="text-white">Loading...</div></div>

  if (error || !ad) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center"><h1 className="text-xl font-semibold text-white mb-2">Not Available</h1><p className="text-gray-400">{error}</p></div>
      </div>
    )
  }

  const cfg = (ad.flow.branding as Record<string, unknown>)?.startScreenConfig as Record<string, unknown> || {}
  const showName = (cfg.showNameField as boolean) ?? true
  const showEmail = (cfg.showEmailField as boolean) ?? false
  const showPhone = (cfg.showPhoneField as boolean) ?? false
  const btnText = (cfg.buttonText as string) || 'Start'
  const bgImage = (ad.flow.branding as Record<string, unknown>)?.startScreenImage as string
  const hasFields = showName || showEmail || showPhone

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      background: bgImage ? `url(${bgImage}) center/cover` : 'linear-gradient(135deg, #FF9500 0%, #EA8500 100%)',
    }}>
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">{ad.flow.name}</h1>
        {ad.flow.startMessage && <p className="text-gray-600 mb-6">{ad.flow.startMessage}</p>}

        {hasFields && (
          <div className="space-y-3 mb-6 text-left">
            {showName && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full px-4 py-3 border border-gray-300 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            )}
            {showEmail && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="w-full px-4 py-3 border border-gray-300 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            )}
            {showPhone && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 123-4567" className="w-full px-4 py-3 border border-gray-300 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            )}
          </div>
        )}

        <button onClick={handleStart} disabled={starting} className="w-full bg-brand-500 text-white py-4 px-6 rounded-[8px] hover:bg-brand-600 disabled:opacity-50 transition-colors font-semibold text-lg">
          {starting ? 'Starting...' : btnText}
        </button>
      </div>
    </div>
  )
}
