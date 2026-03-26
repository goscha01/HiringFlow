'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { uploadVideoFile } from '@/lib/upload-client'
import { type BrandingConfig, mergeBranding } from '@/lib/branding'

interface Video { id: string; filename: string; url: string; displayName?: string | null }
interface Content { id: string; type: string; sortOrder: number; videoId: string | null; video: Video | null; requiredWatch: boolean; autoplayNext: boolean; textContent: string | null }
interface Question { id: string; questionText: string; questionType: string; sortOrder: number; options: Array<{ text: string; isCorrect: boolean }> }
interface Quiz { id: string; title: string; requiredPassing: boolean; passingGrade: number; questions: Question[] }
interface Section { id: string; title: string; sortOrder: number; contents: Content[]; quiz: Quiz | null }
interface Training { id: string; title: string; slug: string; description: string | null; coverImage: string | null; isPublished: boolean; timeLimit: Record<string, unknown> | null; pricing: Record<string, unknown> | null; branding: Record<string, unknown> | null; passingGrade: number; sections: Section[] }

function VideoUploadButton({ onUploaded }: { onUploaded: (video: Video) => void }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('video/')) return
    setUploading(true)
    setProgress(0)
    try {
      const result = await uploadVideoFile(file, (p) => setProgress(p))
      if (result.id) {
        onUploaded({ id: result.id!, filename: result.filename, url: result.url, displayName: null })
      }
    } catch {}
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <label className={`px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
      uploading ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
    }`}>
      {uploading ? `${progress}%` : 'Upload'}
      <input ref={inputRef} type="file" accept="video/*" onChange={handleUpload} disabled={uploading} className="hidden" />
    </label>
  )
}

export default function TrainingEditorPage() {
  const params = useParams()
  const router = useRouter()
  const trainingId = params.id as string

  const [training, setTraining] = useState<Training | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [editingQuiz, setEditingQuiz] = useState<string | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverRef = useRef<HTMLInputElement>(null)

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
        updateTraining({ coverImage: url } as Partial<Training>)
      }
    } catch {}
    setUploadingCover(false)
    if (coverRef.current) coverRef.current.value = ''
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/trainings/${trainingId}`).then(r => r.json()),
      fetch('/api/videos').then(r => r.json()),
    ]).then(([t, v]) => {
      setTraining(t)
      setVideos(v.map((vid: Record<string, unknown>) => ({ id: vid.id, filename: vid.filename, url: vid.url || vid.storageKey, displayName: vid.displayName })))
      if (t.sections?.length > 0) setActiveSection(t.sections[0].id)
      setLoading(false)
    })
  }, [trainingId])

  const refresh = async () => {
    const res = await fetch(`/api/trainings/${trainingId}`)
    if (res.ok) {
      const t = await res.json()
      setTraining(t)
    }
  }

  const updateTraining = async (data: Partial<Training>) => {
    await fetch(`/api/trainings/${trainingId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    refresh()
  }

  const addSection = async () => {
    await fetch(`/api/trainings/${trainingId}/sections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'New Section' }),
    })
    refresh()
  }

  const updateSection = async (sectionId: string, data: Record<string, unknown>) => {
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    refresh()
  }

  const deleteSection = async (sectionId: string) => {
    if (!confirm('Delete this section and all its content?')) return
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}`, { method: 'DELETE' })
    refresh()
  }

  const addContent = async (sectionId: string, type: 'video' | 'text') => {
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/contents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }),
    })
    refresh()
  }

  const updateContent = async (sectionId: string, contentId: string, data: Record<string, unknown>) => {
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/contents`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentId, ...data }),
    })
    refresh()
  }

  const deleteContent = async (sectionId: string, contentId: string) => {
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/contents`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentId }),
    })
    refresh()
  }

  const createOrUpdateQuiz = async (sectionId: string, data: Record<string, unknown>) => {
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/quiz`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    refresh()
  }

  const quizAction = async (sectionId: string, data: Record<string, unknown>) => {
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/quiz`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    refresh()
  }

  const deleteQuiz = async (sectionId: string) => {
    if (!confirm('Delete this quiz?')) return
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/quiz`, { method: 'DELETE' })
    refresh()
  }

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSectionIdx, setPreviewSectionIdx] = useState(0)
  const [previewContentIdx, setPreviewContentIdx] = useState(0)
  const [previewMode, setPreviewMode] = useState<'content' | 'quiz'>('content')
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string[]>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)

  if (loading || !training) return <div className="text-center py-12 text-gray-500">Loading...</div>

  const currentSection = training.sections.find(s => s.id === activeSection)
  const previewSection = training.sections[previewSectionIdx]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/trainings" className="text-gray-400 hover:text-gray-600">&larr;</Link>
          <input
            type="text"
            defaultValue={training.title}
            onBlur={(e) => { if (e.target.value !== training.title) updateTraining({ title: e.target.value }) }}
            className="text-2xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setPreviewSectionIdx(0); setPreviewContentIdx(0); setPreviewMode('content'); setQuizAnswers({}); setQuizSubmitted(false); setPreviewOpen(true) }}
            className="px-4 py-2 text-sm rounded-lg font-medium border border-purple-300 text-purple-600 hover:bg-purple-50"
          >
            Preview
          </button>
          <button
            onClick={() => updateTraining({ isPublished: !training.isPublished })}
            className={`px-4 py-2 text-sm rounded-lg font-medium ${
              training.isPublished ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {training.isPublished ? 'Published' : 'Publish'}
          </button>
          {training.isPublished && (
            <button
              onClick={() => {
                const url = `${window.location.origin}/t/${training.slug}`
                navigator.clipboard.writeText(url)
                alert(`Link copied!\n${url}`)
              }}
              className="px-4 py-2 text-sm rounded-lg font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Copy Link
            </button>
          )}
        </div>
      </div>

      {/* Published URL banner */}
      {training.isPublished && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
          <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
          <span className="text-sm text-green-800 font-medium">Live at:</span>
          <a
            href={`/t/${training.slug}`}
            target="_blank"
            className="text-sm text-green-700 underline hover:text-green-900 truncate"
          >
            {typeof window !== 'undefined' ? window.location.origin : ''}/t/{training.slug}
          </a>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/t/${training.slug}`)
            }}
            className="ml-auto text-xs text-green-600 hover:text-green-800 flex-shrink-0"
          >
            Copy
          </button>
        </div>
      )}

      {/* Cover image */}
      <div className="mb-6">
        {training.coverImage ? (
          <div className="relative rounded-xl overflow-hidden">
            <img src={training.coverImage} alt="Cover" className="w-full h-48 object-cover" />
            <div className="absolute top-3 right-3 flex gap-2">
              <label className="px-3 py-1.5 text-xs bg-white/90 rounded-lg cursor-pointer hover:bg-white shadow">
                Change
                <input ref={coverRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
              </label>
              <button onClick={() => updateTraining({ coverImage: null } as Partial<Training>)} className="px-3 py-1.5 text-xs bg-red-500/90 text-white rounded-lg hover:bg-red-600 shadow">
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="block w-full h-36 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-center">
            <div className="text-center">
              <svg className="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-gray-400">{uploadingCover ? 'Uploading...' : 'Add cover image'}</span>
            </div>
            <input ref={coverRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={uploadingCover} />
          </label>
        )}
      </div>

      {/* Progress steps */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Create content', done: training.sections.length > 0, icon: '1' },
          { label: 'Set price', done: !!training.pricing, icon: '2' },
          { label: 'Customize page', done: !!training.description, icon: '3' },
          { label: 'Publish', done: training.isPublished, icon: '4' },
        ].map((step, i) => (
          <div key={i} className={`p-3 rounded-lg border text-center ${step.done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`w-6 h-6 mx-auto mb-1 rounded-full flex items-center justify-center text-xs font-bold ${
              step.done ? 'bg-green-500 text-white' : 'bg-gray-300 text-white'
            }`}>{step.done ? '✓' : step.icon}</div>
            <span className="text-xs text-gray-600">{step.label}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Left: Sections list */}
        <div className="w-64 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Sections</h3>
            <button onClick={addSection} className="text-xs text-blue-600 hover:text-blue-800">+ Add</button>
          </div>
          <div className="space-y-1">
            {training.sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  activeSection === section.id ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium truncate">{section.title}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {section.contents.length} items{section.quiz ? ' + quiz' : ''}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Section editor */}
        <div className="flex-1 min-w-0">
          {currentSection ? (
            <div>
              {/* Section header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 group flex-1">
                  <input
                    type="text"
                    defaultValue={currentSection.title}
                    onBlur={(e) => { if (e.target.value !== currentSection.title) updateSection(currentSection.id, { title: e.target.value }) }}
                    className="text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-blue-50 rounded px-1 -ml-1"
                  />
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
                <button onClick={() => deleteSection(currentSection.id)} className="text-xs text-red-500 hover:text-red-700">Delete Section</button>
              </div>

              {/* Add content buttons */}
              <div className="flex gap-2 mb-4">
                <button onClick={() => addContent(currentSection.id, 'video')} className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100">
                  + Video
                </button>
                <button onClick={() => addContent(currentSection.id, 'text')} className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100">
                  + Text
                </button>
                {!currentSection.quiz && (
                  <button onClick={() => createOrUpdateQuiz(currentSection.id, {})} className="px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100">
                    + Quiz
                  </button>
                )}
              </div>

              {/* Content items */}
              <div className="space-y-3">
                {currentSection.contents.map((content) => (
                  <div key={content.id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        content.type === 'video' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {content.type}
                      </span>
                      <button onClick={() => deleteContent(currentSection.id, content.id)} className="text-xs text-red-400 hover:text-red-600">&times;</button>
                    </div>

                    {content.type === 'video' ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <select
                            value={content.videoId || ''}
                            onChange={(e) => updateContent(currentSection.id, content.id, { videoId: e.target.value || null })}
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                          >
                            <option value="">Select video...</option>
                            {videos.map(v => (
                              <option key={v.id} value={v.id}>{v.displayName || v.filename}</option>
                            ))}
                          </select>
                          <VideoUploadButton
                            onUploaded={(video) => {
                              setVideos(prev => [video, ...prev])
                              updateContent(currentSection.id, content.id, { videoId: video.id })
                            }}
                          />
                        </div>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input type="checkbox" checked={content.requiredWatch} onChange={(e) => updateContent(currentSection.id, content.id, { requiredWatch: e.target.checked })} />
                            Required to watch
                          </label>
                          <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input type="checkbox" checked={content.autoplayNext} onChange={(e) => updateContent(currentSection.id, content.id, { autoplayNext: e.target.checked })} />
                            Autoplay next
                          </label>
                        </div>
                      </div>
                    ) : (
                      <textarea
                        defaultValue={content.textContent || ''}
                        onBlur={(e) => updateContent(currentSection.id, content.id, { textContent: e.target.value })}
                        rows={4}
                        placeholder="Enter text content..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                ))}

                {/* Quiz */}
                {currentSection.quiz && (
                  <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">Quiz</span>
                        <input
                          type="text"
                          defaultValue={currentSection.quiz.title}
                          onBlur={(e) => createOrUpdateQuiz(currentSection.id, { title: e.target.value })}
                          className="text-sm font-medium text-gray-900 bg-transparent border-none focus:outline-none"
                        />
                      </div>
                      <button onClick={() => deleteQuiz(currentSection.id)} className="text-xs text-red-400 hover:text-red-600">&times;</button>
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input type="checkbox" checked={currentSection.quiz.requiredPassing} onChange={(e) => createOrUpdateQuiz(currentSection.id, { requiredPassing: e.target.checked })} />
                        Require passing
                      </label>
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <span>Grade:</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={currentSection.quiz.passingGrade}
                          onBlur={(e) => createOrUpdateQuiz(currentSection.id, { passingGrade: Number(e.target.value) })}
                          className="w-14 px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                        <span>%</span>
                      </div>
                    </div>

                    {/* Questions */}
                    <div className="space-y-2">
                      {currentSection.quiz.questions.map((q, qi) => (
                        <div key={q.id} className="bg-white rounded-lg p-3 border border-amber-100">
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-[10px] text-gray-400">Q{qi + 1}</span>
                            <button onClick={() => quizAction(currentSection.id, { action: 'delete_question', questionId: q.id })} className="text-xs text-red-400 hover:text-red-600">&times;</button>
                          </div>
                          <input
                            type="text"
                            defaultValue={q.questionText}
                            onBlur={(e) => quizAction(currentSection.id, { action: 'update_question', questionId: q.id, questionText: e.target.value })}
                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <div className="space-y-1.5">
                            {(q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).map((opt, oi) => (
                              <div key={oi} className={`rounded-lg border p-2 ${opt.isCorrect ? 'border-green-300 bg-green-50/50' : 'border-gray-200'}`}>
                                <div className="flex items-center gap-2">
                                  {/* Correct toggle */}
                                  <button
                                    onClick={() => {
                                      const newOpts = (q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).map((o, i) => ({
                                        ...o,
                                        isCorrect: q.questionType === 'multiselect' ? (i === oi ? !o.isCorrect : o.isCorrect) : i === oi,
                                      }))
                                      quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                    }}
                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                      opt.isCorrect ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                                    }`}
                                    title={opt.isCorrect ? 'Correct answer' : 'Mark as correct'}
                                  >
                                    {opt.isCorrect && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                  </button>
                                  {/* Option text */}
                                  <input
                                    type="text"
                                    defaultValue={opt.text}
                                    onBlur={(e) => {
                                      const newOpts = (q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).map((o, i) => i === oi ? { ...o, text: e.target.value } : o)
                                      quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                    }}
                                    className="flex-1 px-2 py-0.5 text-xs border-none bg-transparent focus:outline-none"
                                    placeholder="Option text"
                                  />
                                  {/* Correct/Incorrect label */}
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${opt.isCorrect ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                                    {opt.isCorrect ? 'Correct' : 'Wrong'}
                                  </span>
                                  {/* Delete option */}
                                  {(q.options as Array<{ text: string; isCorrect: boolean }>).length > 2 && (
                                    <button
                                      onClick={() => {
                                        const newOpts = (q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).filter((_, i) => i !== oi)
                                        quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                      }}
                                      className="text-gray-300 hover:text-red-500 text-xs"
                                    >&times;</button>
                                  )}
                                </div>
                                {/* Hint / feedback */}
                                <div className="ml-7 mt-1">
                                  <input
                                    type="text"
                                    defaultValue={opt.hint || ''}
                                    onBlur={(e) => {
                                      const newOpts = (q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).map((o, i) => i === oi ? { ...o, hint: e.target.value } : o)
                                      quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                    }}
                                    placeholder={opt.isCorrect ? 'Hint: "Correct! Because..."' : 'Hint: "Not quite. The answer is..."'}
                                    className="w-full px-2 py-0.5 text-[10px] text-gray-500 border border-dashed border-gray-200 rounded bg-transparent focus:outline-none focus:border-blue-300"
                                  />
                                </div>
                              </div>
                            ))}
                            <button
                              onClick={() => {
                                const newOpts = [...(q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>), { text: 'New option', isCorrect: false, hint: '' }]
                                quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                              }}
                              className="text-[10px] text-blue-600 hover:text-blue-800 mt-1"
                            >
                              + Add option
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => quizAction(currentSection.id, { action: 'add_question' })}
                      className="mt-2 px-3 py-1.5 text-xs text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100"
                    >
                      + Add Question
                    </button>
                  </div>
                )}
              </div>

              {currentSection.contents.length === 0 && !currentSection.quiz && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Add video, text, or quiz content to this section
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              {training.sections.length === 0 ? 'Add a section to get started' : 'Select a section'}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewOpen && previewSection && (() => {
        const brand = mergeBranding(training.branding as Partial<BrandingConfig> | null)
        const btnStyle: React.CSSProperties = {
          backgroundColor: brand.buttons.style === 'filled' ? brand.colors.primary : 'transparent',
          color: brand.buttons.style === 'filled' ? '#fff' : brand.colors.primary,
          border: brand.buttons.style === 'outline' ? `2px solid ${brand.colors.primary}` : 'none',
          borderRadius: brand.buttons.shape === 'pill' ? '9999px' : brand.buttons.shape === 'square' ? '4px' : '12px',
          padding: brand.buttons.size === 'compact' ? '8px 16px' : brand.buttons.size === 'large' ? '16px 32px' : '12px 24px',
          fontSize: '14px', fontWeight: 500, cursor: 'pointer',
        }

        return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewOpen(false)}>
          <div
            className="rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            style={{ backgroundColor: brand.colors.background, fontFamily: brand.typography.fontFamily, color: brand.colors.text }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${brand.colors.accent}30` }}>
              <div>
                <h3 className="font-semibold" style={{ color: brand.colors.text }}>{training.title}</h3>
                <p className="text-xs" style={{ color: brand.colors.secondaryText }}>Section {previewSectionIdx + 1} of {training.sections.length}: {previewSection.title}</p>
              </div>
              <button onClick={() => setPreviewOpen(false)} className="text-xl" style={{ color: brand.colors.secondaryText }}>&times;</button>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-y-auto p-6">
              {previewMode === 'content' ? (
                <>
                  {previewSection.contents.length > 0 ? (() => {
                    const content = previewSection.contents[previewContentIdx]
                    if (!content) return null
                    return (
                      <div>
                        {content.type === 'video' && content.video ? (
                          <div className="rounded-lg overflow-hidden bg-black mb-4">
                            <video src={content.video.url} controls className="w-full" autoPlay={content.autoplayNext} />
                          </div>
                        ) : content.type === 'text' && content.textContent ? (
                          <div className="prose prose-sm max-w-none mb-4 whitespace-pre-wrap">{content.textContent}</div>
                        ) : (
                          <div className="text-center py-8 text-gray-400">No content</div>
                        )}

                        {/* Content navigation */}
                        <div className="flex items-center justify-between mt-4">
                          <span className="text-xs text-gray-400">{previewContentIdx + 1} / {previewSection.contents.length}</span>
                          <div className="flex gap-2">
                            {previewContentIdx > 0 && (
                              <button onClick={() => setPreviewContentIdx(previewContentIdx - 1)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Back</button>
                            )}
                            {previewContentIdx < previewSection.contents.length - 1 ? (
                              <button onClick={() => setPreviewContentIdx(previewContentIdx + 1)} style={btnStyle}>Next</button>
                            ) : previewSection.quiz ? (
                              <button onClick={() => { setPreviewMode('quiz'); setQuizAnswers({}); setQuizSubmitted(false) }} style={btnStyle}>Take Quiz</button>
                            ) : previewSectionIdx < training.sections.length - 1 ? (
                              <button onClick={() => { setPreviewSectionIdx(previewSectionIdx + 1); setPreviewContentIdx(0) }} style={btnStyle}>Next Section</button>
                            ) : (
                              <button onClick={() => setPreviewOpen(false)} style={btnStyle}>Complete</button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })() : previewSection.quiz ? (
                    <button onClick={() => { setPreviewMode('quiz'); setQuizAnswers({}); setQuizSubmitted(false) }} style={{ ...btnStyle, width: '100%', padding: '16px' }}>Take Quiz</button>
                  ) : (
                    <div className="text-center py-8 text-gray-400">This section has no content</div>
                  )}
                </>
              ) : (
                /* Quiz mode */
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{previewSection.quiz!.title}</h3>
                  <p className="text-xs text-gray-400 mb-4">Passing grade: {previewSection.quiz!.passingGrade}%</p>

                  <div className="space-y-4">
                    {previewSection.quiz!.questions.map((q, qi) => {
                      const opts = q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>
                      const selected = quizAnswers[q.id] || []

                      return (
                        <div key={q.id} className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm font-medium text-gray-800 mb-2">{qi + 1}. {q.questionText}</p>
                          <div className="space-y-1.5">
                            {opts.map((opt, oi) => {
                              const isSelected = selected.includes(String(oi))
                              const showResult = quizSubmitted
                              const isCorrectAnswer = opt.isCorrect

                              let bgColor = 'bg-white border-gray-200'
                              if (showResult && isSelected && isCorrectAnswer) bgColor = 'bg-green-50 border-green-400'
                              else if (showResult && isSelected && !isCorrectAnswer) bgColor = 'bg-red-50 border-red-400'
                              else if (showResult && !isSelected && isCorrectAnswer) bgColor = 'bg-green-50/50 border-green-200'
                              else if (isSelected) bgColor = 'bg-blue-50 border-blue-400'

                              return (
                                <div key={oi}>
                                  <button
                                    onClick={() => {
                                      if (quizSubmitted) return
                                      if (q.questionType === 'multiselect') {
                                        setQuizAnswers(prev => ({
                                          ...prev,
                                          [q.id]: isSelected ? selected.filter(s => s !== String(oi)) : [...selected, String(oi)],
                                        }))
                                      } else {
                                        setQuizAnswers(prev => ({ ...prev, [q.id]: [String(oi)] }))
                                      }
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-lg border transition-colors ${bgColor} ${quizSubmitted ? '' : 'hover:border-blue-400'}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{opt.text}</span>
                                      {showResult && isSelected && isCorrectAnswer && <span className="text-green-600 text-xs ml-auto">✓ Correct</span>}
                                      {showResult && isSelected && !isCorrectAnswer && <span className="text-red-600 text-xs ml-auto">✗ Incorrect</span>}
                                      {showResult && !isSelected && isCorrectAnswer && <span className="text-green-500 text-[10px] ml-auto">← Correct answer</span>}
                                    </div>
                                  </button>
                                  {showResult && isSelected && opt.hint && (
                                    <p className={`text-xs mt-0.5 ml-3 ${isCorrectAnswer ? 'text-green-600' : 'text-red-600'}`}>{opt.hint}</p>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Quiz actions */}
                  <div className="mt-4 flex items-center justify-between">
                    {quizSubmitted ? (() => {
                      const total = previewSection.quiz!.questions.length
                      const correct = previewSection.quiz!.questions.filter(q => {
                        const opts = q.options as Array<{ isCorrect: boolean }>
                        const selected = (quizAnswers[q.id] || []).map(Number)
                        return opts.every((o, i) => o.isCorrect === selected.includes(i))
                      }).length
                      const pct = Math.round((correct / total) * 100)
                      const passed = pct >= previewSection.quiz!.passingGrade

                      return (
                        <>
                          <div className={`text-sm font-medium ${passed ? 'text-green-700' : 'text-red-700'}`}>
                            Score: {correct}/{total} ({pct}%) — {passed ? 'Passed!' : 'Not passed'}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setQuizAnswers({}); setQuizSubmitted(false) }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Retry</button>
                            {previewSectionIdx < training.sections.length - 1 && (
                              <button onClick={() => { setPreviewSectionIdx(previewSectionIdx + 1); setPreviewContentIdx(0); setPreviewMode('content'); setQuizAnswers({}); setQuizSubmitted(false) }} style={btnStyle}>Next Section</button>
                            )}
                          </div>
                        </>
                      )
                    })() : (
                      <>
                        <span />
                        <button
                          onClick={() => setQuizSubmitted(true)}
                          disabled={Object.keys(quizAnswers).length < previewSection.quiz!.questions.length}
                          style={{ ...btnStyle, opacity: Object.keys(quizAnswers).length < previewSection.quiz!.questions.length ? 0.5 : 1 }}
                        >
                          Submit Quiz
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Section progress bar */}
            <div className="px-6 py-3" style={{ borderTop: `1px solid ${brand.colors.accent}20`, backgroundColor: `${brand.colors.background}` }}>
              <div className="flex gap-1">
                {training.sections.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => { setPreviewSectionIdx(i); setPreviewContentIdx(0); setPreviewMode('content'); setQuizAnswers({}); setQuizSubmitted(false) }}
                    className="flex-1 h-1.5 rounded-full transition-colors"
                    style={{ backgroundColor: i < previewSectionIdx ? brand.colors.accent : i === previewSectionIdx ? brand.colors.primary : `${brand.colors.text}20` }}
                    title={s.title}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px]" style={{ color: brand.colors.secondaryText }}>{training.sections[0]?.title}</span>
                <span className="text-[10px]" style={{ color: brand.colors.secondaryText }}>{training.sections[training.sections.length - 1]?.title}</span>
              </div>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
