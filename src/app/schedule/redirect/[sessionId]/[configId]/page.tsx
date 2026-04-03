'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function ScheduleRedirectPage() {
  const params = useParams()
  const sessionId = params.sessionId as string
  const configId = params.configId as string
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/public/schedule/redirect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, configId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl
        } else {
          setError(true)
        }
      })
      .catch(() => setError(true))
  }, [sessionId, configId])

  if (error) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
        <div className="bg-white rounded-[12px] p-12 max-w-lg text-center border border-[#F1F1F3]">
          <h1 className="text-[28px] font-semibold text-[#262626] mb-3">Scheduling Unavailable</h1>
          <p className="text-lg text-[#59595A]">This scheduling link is no longer available. Please contact us for assistance.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]">
      <div className="text-center">
        <div className="w-8 h-8 border-3 border-[#FF9500] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#59595A]">Redirecting to scheduling...</p>
      </div>
    </div>
  )
}
