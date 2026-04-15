'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { SubNav } from '../_components/SubNav'

const TRAINING_NAV = [
  { href: '/dashboard/trainings', label: 'Trainings' },
  { href: '/dashboard/ai-calls', label: 'AI Calls' },
]

interface Training {
  id: string
  title: string
  slug: string
  description: string | null
  coverImage: string | null
  isPublished: boolean
  accessMode: string
  timeLimit: { type: string; value?: number; date?: string } | null
  pricing: { type: string; price?: number; currency?: string } | null
  createdAt: string
  sections: Array<{ id: string; _count: { contents: number } }>
  _count: { enrollments: number }
}

export default function TrainingsPage() {
  const [trainings, setTrainings] = useState<Training[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newTimeLimit, setNewTimeLimit] = useState<{ type: string; value?: number }>({ type: 'unlimited' })
  const [newPricing, setNewPricing] = useState<{ type: string; price?: number }>({ type: 'free' })
  const [newCoverImage, setNewCoverImage] = useState<string | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [creating, setCreating] = useState(false)

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads/logo', { method: 'POST', body: formData })
      if (res.ok) {
        const { url } = await res.json()
        setNewCoverImage(url)
      }
    } catch {}
    setUploadingCover(false)
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  useEffect(() => { fetchTrainings() }, [])

  const fetchTrainings = async () => {
    const res = await fetch('/api/trainings')
    if (res.ok) setTrainings(await res.json())
    setLoading(false)
  }

  const createTraining = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    const res = await fetch('/api/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, timeLimit: newTimeLimit, pricing: newPricing, coverImage: newCoverImage }),
    })
    if (res.ok) {
      setShowCreate(false)
      setNewTitle('')
      setNewTimeLimit({ type: 'unlimited' })
      setNewPricing({ type: 'free' })
      setNewCoverImage(null)
      fetchTrainings()
    }
    setCreating(false)
  }

  const deleteTraining = async (id: string) => {
    if (!confirm('Delete this training?')) return
    await fetch(`/api/trainings/${id}`, { method: 'DELETE' })
    fetchTrainings()
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>

  return (
    <div>
      <SubNav items={TRAINING_NAV} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trainings</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary text-sm"
        >
          + New Training
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Training</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Training Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Onboarding Program"
                  className="w-full px-3 py-2 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image</label>
                {newCoverImage ? (
                  <div className="relative">
                    <img src={newCoverImage} alt="Cover" className="w-full h-32 object-cover rounded-lg" />
                    <button onClick={() => setNewCoverImage(null)} className="absolute top-2 right-2 w-6 h-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70">&times;</button>
                  </div>
                ) : (
                  <label className="block w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand-400 transition-colors flex items-center justify-center">
                    <div className="text-center">
                      <svg className="w-8 h-8 mx-auto text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs text-gray-500">{uploadingCover ? 'Uploading...' : 'Upload cover image'}</span>
                    </div>
                    <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={uploadingCover} />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time Limit</label>
                <div className="flex gap-2">
                  {(['unlimited', 'days', 'calendar'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setNewTimeLimit({ type: t })}
                      className={`flex-1 py-2 text-xs capitalize rounded-lg border ${
                        newTimeLimit.type === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {newTimeLimit.type === 'days' && (
                  <input
                    type="number"
                    min={1}
                    value={newTimeLimit.value || ''}
                    onChange={(e) => setNewTimeLimit({ type: 'days', value: Number(e.target.value) })}
                    placeholder="Number of days"
                    className="w-full mt-2 px-3 py-2 border border-surface-border rounded-[8px] text-sm"
                  />
                )}
                {newTimeLimit.type === 'calendar' && (
                  <input
                    type="date"
                    onChange={(e) => setNewTimeLimit({ type: 'calendar', value: undefined, ...({ date: e.target.value } as Record<string, string>) })}
                    className="w-full mt-2 px-3 py-2 border border-surface-border rounded-[8px] text-sm"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pricing</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewPricing({ type: 'free' })}
                    className={`flex-1 py-2 text-xs rounded-lg border ${
                      newPricing.type === 'free' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'
                    }`}
                  >
                    Free
                  </button>
                  <button
                    onClick={() => setNewPricing({ type: 'paid', price: 0 })}
                    className={`flex-1 py-2 text-xs rounded-lg border ${
                      newPricing.type === 'paid' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'
                    }`}
                  >
                    Paid
                  </button>
                </div>
                {newPricing.type === 'paid' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={newPricing.price || ''}
                      onChange={(e) => setNewPricing({ type: 'paid', price: Number(e.target.value) })}
                      placeholder="Price"
                      className="flex-1 px-3 py-2 border border-surface-border rounded-[8px] text-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1 py-2.5 text-sm">
                Cancel
              </button>
              <button onClick={createTraining} disabled={creating || !newTitle.trim()} className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Training'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Training cards */}
      {trainings.length === 0 ? (
        <div className="bg-white rounded-lg border border-surface-border p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-50 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No trainings yet</h2>
          <p className="text-gray-500 mb-4">Create your first training program</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            + New Training
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trainings.map((t) => (
            <div key={t.id} className="bg-white rounded-lg border border-surface-border overflow-hidden hover:shadow-md transition-shadow">
              {t.coverImage && (
                <Link href={`/dashboard/trainings/${t.id}`}>
                  <img src={t.coverImage} alt={t.title} className="w-full h-36 object-cover" />
                </Link>
              )}
              <Link href={`/dashboard/trainings/${t.id}`} className="block p-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 text-sm">{t.title}</h3>
                  <div className="flex gap-1">
                    {t.accessMode === 'invitation_only' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">Gated</span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      t.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {t.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </div>
                </div>
                {t.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{t.description}</p>}
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{t.sections.length} sections</span>
                  <span>{t._count.enrollments} enrolled</span>
                  <span>{(t.pricing as { type: string })?.type === 'paid' ? `$${(t.pricing as { price?: number })?.price || 0}` : 'Free'}</span>
                  <span>{(t.timeLimit as { type: string })?.type === 'unlimited' ? 'No limit' : (t.timeLimit as { type: string })?.type}</span>
                </div>
              </Link>
              <div className="border-t border-gray-100 px-5 py-2 flex justify-end">
                <button onClick={() => deleteTraining(t.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
