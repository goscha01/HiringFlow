'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Ad {
  id: string; name: string; source: string; campaign: string | null
  slug: string; isActive: boolean
  flow: { id: string; name: string; slug: string; isPublished: boolean }
}

export default function AdPreviewPage() {
  const params = useParams()
  const id = params.id as string
  const [ad, setAd] = useState<Ad | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/ads/${id}`).then(r => r.ok ? r.json() : null).then(d => { setAd(d); setLoading(false) })
  }, [id])

  if (loading) return <div className="text-center py-12 text-grey-40">Loading...</div>
  if (!ad) return <div className="text-center py-12 text-grey-40">Ad not found</div>

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const trackedLink = `${baseUrl}/a/${ad.slug}`
  const flowLink = `${baseUrl}/f/${ad.flow.slug}`
  const canTest = ad.isActive && ad.flow.isPublished

  const copyLink = () => {
    navigator.clipboard.writeText(trackedLink)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/campaigns" className="text-grey-40 hover:text-grey-15">&larr; Campaigns</Link>
        <h1 className="text-2xl font-semibold text-grey-15">Ad Preview: {ad.name}</h1>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 mb-6">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ad.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
          {ad.isActive ? 'Active' : 'Paused'}
        </span>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ad.flow.isPublished ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
          Flow: {ad.flow.isPublished ? 'Published' : 'Not Published'}
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 font-medium capitalize">{ad.source}</span>
        {ad.campaign && <span className="text-xs text-grey-40">Campaign: {ad.campaign}</span>}
      </div>

      {!canTest && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-[8px] p-4 mb-6">
          <p className="text-sm text-yellow-800 font-medium">Cannot test the full workflow yet:</p>
          <ul className="text-sm text-yellow-700 mt-1 list-disc list-inside">
            {!ad.isActive && <li>Ad is paused — activate it in Campaigns</li>}
            {!ad.flow.isPublished && <li>Flow &quot;{ad.flow.name}&quot; is not published — publish it in the flow builder</li>}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Workflow steps */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-grey-20">Candidate Workflow</h3>

          {/* Step 1: Tracked Link */}
          <div className="bg-white rounded-[12px] border border-surface-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">1</span>
              <span className="text-sm font-semibold text-grey-15">Candidate clicks your tracked link</span>
            </div>
            <div className="bg-surface rounded-[8px] p-3 flex items-center gap-2">
              <code className="flex-1 text-sm text-grey-15 truncate">{trackedLink}</code>
              <button onClick={copyLink} className={`text-xs px-3 py-1.5 rounded-[6px] font-medium flex-shrink-0 ${copied ? 'bg-green-100 text-green-700' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-grey-50 mt-2">This link is what you post on {ad.source}. It tracks which ad brought the candidate.</p>
          </div>

          {/* Step 2: Start Screen */}
          <div className="bg-white rounded-[12px] border border-surface-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">2</span>
              <span className="text-sm font-semibold text-grey-15">Candidate sees start screen</span>
            </div>
            <p className="text-sm text-grey-35">They enter their name/info and click Start. A new session is created with source attribution from this ad.</p>
          </div>

          {/* Step 3: Flow */}
          <div className="bg-white rounded-[12px] border border-surface-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">3</span>
              <span className="text-sm font-semibold text-grey-15">Candidate completes flow: {ad.flow.name}</span>
            </div>
            <p className="text-sm text-grey-35">They go through your screening steps — video questions, forms, info screens.</p>
          </div>

          {/* Step 4: Automation */}
          <div className="bg-white rounded-[12px] border border-surface-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">4</span>
              <span className="text-sm font-semibold text-grey-15">Automations fire</span>
            </div>
            <p className="text-sm text-grey-35">If you have automations set for &quot;Flow Completed&quot; or &quot;Flow Passed&quot;, emails are sent automatically (training invite, scheduling link, etc.)</p>
          </div>

          {/* Step 5: Pipeline */}
          <div className="bg-white rounded-[12px] border border-surface-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center">5</span>
              <span className="text-sm font-semibold text-grey-15">Candidate appears in your pipeline</span>
            </div>
            <p className="text-sm text-grey-35">View them in Candidates with source &quot;{ad.source}&quot; and ad &quot;{ad.name}&quot;. Track them through training → scheduling → hired.</p>
          </div>
        </div>

        {/* Right: Test it */}
        <div>
          <h3 className="text-sm font-semibold text-grey-20 mb-4">Test It</h3>

          <div className="bg-white rounded-[12px] border-2 border-brand-200 p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h3 className="text-lg font-semibold text-grey-15 mb-2">Run the Full Workflow</h3>
            <p className="text-sm text-grey-40 mb-6">Click below to experience exactly what your candidates see — from ad click through the entire flow.</p>

            {canTest ? (
              <a
                href={trackedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block w-full bg-brand-500 text-white py-3.5 px-6 rounded-[8px] hover:bg-brand-600 transition-colors font-semibold text-lg"
              >
                Start as Candidate →
              </a>
            ) : (
              <button disabled className="w-full bg-gray-200 text-grey-40 py-3.5 px-6 rounded-[8px] font-semibold text-lg cursor-not-allowed">
                Activate ad + publish flow first
              </button>
            )}

            <div className="mt-4 space-y-2">
              <a href={flowLink} target="_blank" rel="noopener noreferrer" className="block text-sm text-brand-500 hover:text-brand-600">
                Preview flow directly (no tracking) →
              </a>
              <Link href={`/dashboard/flows/${ad.flow.id}/builder`} className="block text-sm text-grey-35 hover:text-grey-15">
                Edit flow →
              </Link>
            </div>
          </div>

          {/* Quick checklist */}
          <div className="bg-white rounded-[12px] border border-surface-border p-6 mt-4">
            <h4 className="text-sm font-semibold text-grey-15 mb-3">Setup Checklist</h4>
            <div className="space-y-2">
              {[
                { label: 'Flow created', done: true },
                { label: 'Flow has steps', done: true },
                { label: 'Flow published', done: ad.flow.isPublished },
                { label: 'Ad active', done: ad.isActive },
                { label: 'Automations set up', done: null, note: 'optional' },
                { label: 'Training created', done: null, note: 'optional' },
                { label: 'Scheduling link added', done: null, note: 'optional' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  {item.done === true ? (
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  ) : item.done === false ? (
                    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${item.done === false ? 'text-red-600' : 'text-grey-35'}`}>{item.label}</span>
                  {item.note && <span className="text-xs text-grey-50">({item.note})</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
