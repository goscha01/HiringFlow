'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

interface FlowInfo {
  id: string
  name: string
  slug: string
  startMessage: string
  endMessage: string
  startStepId: string | null
}

export default function FlowStartPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const isPreview = searchParams.get('preview') === 'true'

  const [flow, setFlow] = useState<FlowInfo | null>(null)
  const [name, setName] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFlow()
  }, [slug])

  const fetchFlow = async () => {
    const res = await fetch(`/api/public/flows/${slug}${isPreview ? '?preview=true' : ''}`)
    if (res.ok) {
      const data = await res.json()
      setFlow(data)
    } else {
      setError('Flow not found or not available')
    }
    setLoading(false)
  }

  const handleStart = async () => {
    if (!flow) return
    setStarting(true)

    const res = await fetch('/api/public/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flowSlug: slug,
        candidateName: name || null,
        preview: isPreview || undefined,
      }),
    })

    if (res.ok) {
      const data = await res.json()
      router.replace(`/f/${slug}/s/${data.id}`)
    } else {
      setError('Failed to start session')
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (error || !flow) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white mb-2">Not Available</h1>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!flow.startStepId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white mb-2">{flow.name}</h1>
          <p className="text-gray-400">This flow has no steps yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 p-4">
      {isPreview && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-400 text-yellow-900 text-center py-1.5 text-sm font-medium z-50">
          Preview Mode — This flow is not published
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-brand-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">{flow.name}</h1>

        <p className="text-gray-600 mb-8">{flow.startMessage}</p>

        <div className="mb-6">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-center"
          />
        </div>

        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full bg-brand-500 text-white py-4 px-6 rounded-xl hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold text-lg"
        >
          {starting ? 'Starting...' : 'Start'}
        </button>

        <p className="text-xs text-gray-400 mt-4">
          Your responses will be recorded
        </p>
      </div>
    </div>
  )
}
