'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function DonePage() {
  const params = useParams()
  const slug = params.slug as string
  const [endMessage, setEndMessage] = useState('Thank you for your participation!')
  const [flowName, setFlowName] = useState('')

  useEffect(() => {
    fetch(`/api/public/flows/${slug}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setEndMessage(data.endMessage || 'Thank you for your participation!')
          setFlowName(data.name || '')
        }
      })
      .catch(() => {})
  }, [slug])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          All Done!
        </h1>

        <p className="text-gray-600 mb-6">
          {endMessage}
        </p>

        <p className="text-sm text-gray-500">
          You can close this window now.
        </p>
      </div>
    </div>
  )
}
