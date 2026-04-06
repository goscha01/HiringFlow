'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

// Dynamically import the call component to avoid SSR issues with ElevenLabs
const CallInterface = dynamic(() => import('./CallInterface'), { ssr: false })

export default function CandidateCallPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const agentId = params.slug as string
  const candidateName = searchParams.get('name') || ''

  return <CallInterface agentId={agentId} candidateName={candidateName} />
}
