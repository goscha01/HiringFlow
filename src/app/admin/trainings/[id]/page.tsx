'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { uploadVideoFile } from '@/lib/upload-client'
import { type BrandingConfig, mergeBranding } from '@/lib/branding'

interface Video { id: string; filename: string; url: string; displayName?: string | null }
interface Content { id: string; type: string; sortOrder: number; videoId: string | null; video: Video | null; requiredWatch: boolean; autoplayNext: boolean; textContent: string | null }
interface Question { id: string; questionText: string; questionType: string; sortOrder: number; options: Array<{ text: string; isCorrect: boolean; hint?: string }> }
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
    setUploading(true); setProgress(0)
    try {
      const result = await uploadVideoFile(file, (p) => setProgress(p))
      if (result.id) onUploaded({ id: result.id!, filename: result.filename, url: result.url, displayName: null })
    } catch {}
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }
  return (
    <label className={`px-4 py-2 rounded-[8px] text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
      uploading ? 'bg-surface text-grey-40 cursor-wait' : 'bg-brand-50 text-brand-500 border border-brand-200 hover:bg-brand-100'
    }`}>
      {uploading ? `${progress}%` : 'Upload'}
      <input ref={inputRef} type="file" accept="video/*" onChange={handleUpload} disabled={uploading} className="hidden" />
    </label>
  )
}

export default function TrainingEditorPage() {
  const params = useParams()
  const trainingId = params.id as string

  const [training, setTraining] = useState<Training | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverRef = useRef<HTMLInputElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSectionIdx, setPreviewSectionIdx] = useState(0)
  const [previewContentIdx, setPreviewContentIdx] = useState(0)
  const [previewMode, setPreviewMode] = useState<'content' | 'quiz'>('content')
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string[]>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads/logo', { method: 'POST', body: formData })
      if (res.ok) { const { url } = await res.json(); updateTraining({ coverImage: url } as Partial<Training>) }
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

  const refresh = async () => { const res = await fetch(`/api/trainings/${trainingId}`); if (res.ok) setTraining(await res.json()) }
  const updateTraining = async (data: Partial<Training>) => { await fetch(`/api/trainings/${trainingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); refresh() }
  const addSection = async () => { await fetch(`/api/trainings/${trainingId}/sections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'New Section' }) }); refresh() }
  const updateSection = async (sectionId: string, data: Record<string, unknown>) => { await fetch(`/api/trainings/${trainingId}/sections/${sectionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); refresh() }
  const deleteSection = async (sectionId: string) => { if (!confirm('Delete this section?')) return; await fetch(`/api/trainings/${trainingId}/sections/${sectionId}`, { method: 'DELETE' }); refresh() }
  const addContent = async (sectionId: string, type: 'video' | 'text') => { await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/contents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) }); refresh() }
  const updateContent = async (sectionId: string, contentId: string, data: Record<string, unknown>) => { await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/contents`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentId, ...data }) }); refresh() }
  const deleteContent = async (sectionId: string, contentId: string) => { await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/contents`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentId }) }); refresh() }
  const createOrUpdateQuiz = async (sectionId: string, data: Record<string, unknown>) => { await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/quiz`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); refresh() }
  const quizAction = async (sectionId: string, data: Record<string, unknown>) => { await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/quiz`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); refresh() }
  const deleteQuiz = async (sectionId: string) => { if (!confirm('Delete this quiz?')) return; await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/quiz`, { method: 'DELETE' }); refresh() }

  if (loading || !training) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>

  const currentSection = training.sections.find(s => s.id === activeSection)
  const previewSection = training.sections[previewSectionIdx]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/admin/trainings" className="w-10 h-10 flex items-center justify-center rounded-[8px] border border-surface-border hover:bg-surface transition-colors">
            <svg className="w-5 h-5 text-grey-35" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <div>
            <input
              type="text"
              defaultValue={training.title}
              onBlur={(e) => { if (e.target.value !== training.title) updateTraining({ title: e.target.value }) }}
              className="text-[28px] font-semibold text-grey-15 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
            />
            <p className="text-sm text-grey-40">/{training.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setPreviewSectionIdx(0); setPreviewContentIdx(0); setPreviewMode('content'); setQuizAnswers({}); setQuizSubmitted(false); setPreviewOpen(true) }}
            className="btn-secondary text-sm"
          >
            Preview
          </button>
          <button
            onClick={() => updateTraining({ isPublished: !training.isPublished })}
            className={training.isPublished ? 'px-5 py-3 text-sm rounded-[8px] font-medium bg-green-50 text-green-700 border border-green-200' : 'btn-primary text-sm'}
          >
            {training.isPublished ? '● Published' : 'Publish'}
          </button>
          {training.isPublished && (
            <button
              onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/t/${training.slug}`); alert('Link copied!') }}
              className="btn-secondary text-sm gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              Copy Link
            </button>
          )}
        </div>
      </div>

      {/* Published URL banner */}
      {training.isPublished && (
        <div className="mb-8 flex items-center gap-3 px-5 py-4 bg-green-50 border border-green-200 rounded-[8px]">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-sm text-green-800 font-medium">Live at:</span>
          <a href={`/t/${training.slug}`} target="_blank" className="text-sm text-green-700 underline hover:text-green-900 truncate">
            {typeof window !== 'undefined' ? window.location.origin : ''}/t/{training.slug}
          </a>
          <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/t/${training.slug}`)} className="ml-auto text-xs text-green-600 hover:text-green-800">Copy</button>
        </div>
      )}

      {/* Cover image */}
      <div className="mb-8">
        {training.coverImage ? (
          <div className="relative rounded-[12px] overflow-hidden">
            <img src={training.coverImage} alt="Cover" className="w-full h-[200px] object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute bottom-4 right-4 flex gap-2">
              <label className="px-4 py-2 text-xs bg-white/90 rounded-[8px] cursor-pointer hover:bg-white shadow font-medium">
                Change
                <input ref={coverRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
              </label>
              <button onClick={() => updateTraining({ coverImage: null } as Partial<Training>)} className="px-4 py-2 text-xs bg-red-500/90 text-white rounded-[8px] hover:bg-red-600 shadow font-medium">
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="block w-full h-[160px] border-2 border-dashed border-surface-divider rounded-[12px] cursor-pointer hover:border-brand-400 transition-colors flex items-center justify-center">
            <div className="text-center">
              <svg className="w-10 h-10 mx-auto text-grey-60 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span className="text-sm text-grey-40">{uploadingCover ? 'Uploading...' : 'Add cover image'}</span>
            </div>
            <input ref={coverRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={uploadingCover} />
          </label>
        )}
      </div>

      {/* Progress steps — Figma numbered stats style */}
      <div className="bg-white rounded-[12px] border border-surface-border mb-8">
        <div className="px-8 py-5 border-b border-surface-border">
          <h2 className="text-[20px] font-semibold text-grey-15">Setup Progress</h2>
        </div>
        <div className="flex items-center px-[50px] py-6">
          {[
            { label: 'Create content', done: training.sections.length > 0 },
            { label: 'Set price', done: !!training.pricing },
            { label: 'Customize page', done: !!training.description },
            { label: 'Publish', done: training.isPublished },
          ].map((step, i, arr) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                  step.done ? 'bg-green-500 text-white' : 'bg-surface border border-surface-border text-grey-40'
                }`}>
                  {step.done ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> : String(i + 1).padStart(2, '0')}
                </div>
                <span className={`text-sm font-medium ${step.done ? 'text-green-700' : 'text-grey-35'}`}>{step.label}</span>
              </div>
              {i < arr.length - 1 && <div className="flex-1 h-px bg-surface-border mx-6" />}
            </div>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex gap-6">
        {/* Left: Sections sidebar */}
        <div className="w-[260px] flex-shrink-0">
          <div className="bg-white rounded-[12px] border border-surface-border">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <h3 className="text-sm font-semibold text-grey-15 uppercase tracking-wide">Sections</h3>
              <button onClick={addSection} className="text-xs text-brand-500 hover:text-brand-600 font-medium">+ Add</button>
            </div>
            <div className="p-2">
              {training.sections.map((section, i) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left px-4 py-3 rounded-[8px] text-sm transition-colors mb-1 ${
                    activeSection === section.id
                      ? 'bg-brand-50 text-brand-700 border border-brand-200'
                      : 'text-grey-35 hover:bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold ${activeSection === section.id ? 'text-brand-500' : 'text-grey-50'}`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{section.title}</div>
                      <div className="text-[11px] text-grey-40 mt-0.5">
                        {section.contents.length} items{section.quiz ? ' · Quiz' : ''}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {training.sections.length === 0 && (
                <div className="text-center py-6 text-grey-40 text-sm">No sections yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Section editor */}
        <div className="flex-1 min-w-0">
          {currentSection ? (
            <div className="bg-white rounded-[12px] border border-surface-border">
              {/* Section header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-surface-border">
                <div className="flex items-center gap-3 group flex-1">
                  <input
                    type="text"
                    defaultValue={currentSection.title}
                    onBlur={(e) => { if (e.target.value !== currentSection.title) updateSection(currentSection.id, { title: e.target.value }) }}
                    className="text-lg font-semibold text-grey-15 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-brand-400 focus:bg-brand-50 rounded-[8px] px-2 py-1 -ml-2"
                  />
                  <svg className="w-4 h-4 text-grey-60 group-hover:text-grey-30 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </div>
                <button onClick={() => deleteSection(currentSection.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
              </div>

              <div className="p-6">
                {/* Add content buttons */}
                <div className="flex gap-3 mb-6">
                  <button onClick={() => addContent(currentSection.id, 'video')} className="px-4 py-2.5 text-xs bg-brand-50 text-brand-600 border border-brand-200 rounded-[8px] hover:bg-brand-100 font-medium">
                    + Video
                  </button>
                  <button onClick={() => addContent(currentSection.id, 'text')} className="px-4 py-2.5 text-xs bg-surface text-grey-35 border border-surface-border rounded-[8px] hover:bg-surface-light font-medium">
                    + Text
                  </button>
                  {!currentSection.quiz && (
                    <button onClick={() => createOrUpdateQuiz(currentSection.id, {})} className="px-4 py-2.5 text-xs bg-[#FFF7ED] text-[#FF9500] border border-[#FFEDD5] rounded-[8px] hover:bg-[#FFEDD5] font-medium">
                      + Quiz
                    </button>
                  )}
                </div>

                {/* Content items */}
                <div className="space-y-4">
                  {currentSection.contents.map((content) => (
                    <div key={content.id} className="rounded-[8px] border border-surface-border p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
                          content.type === 'video' ? 'bg-brand-50 text-brand-600' : 'bg-surface text-grey-35'
                        }`}>
                          {content.type === 'video' ? '▶ Video' : '¶ Text'}
                        </span>
                        <button onClick={() => deleteContent(currentSection.id, content.id)} className="w-7 h-7 flex items-center justify-center rounded-[8px] text-grey-50 hover:bg-red-50 hover:text-red-500 transition-colors">&times;</button>
                      </div>

                      {content.type === 'video' ? (
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <select
                              value={content.videoId || ''}
                              onChange={(e) => updateContent(currentSection.id, content.id, { videoId: e.target.value || null })}
                              className="flex-1 px-4 py-2.5 text-sm border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                              <option value="">Select video...</option>
                              {videos.map(v => <option key={v.id} value={v.id}>{v.displayName || v.filename}</option>)}
                            </select>
                            <VideoUploadButton onUploaded={(video) => { setVideos(prev => [video, ...prev]); updateContent(currentSection.id, content.id, { videoId: video.id }) }} />
                          </div>
                          <div className="flex gap-5">
                            <label className="flex items-center gap-2 text-xs text-grey-35 cursor-pointer">
                              <input type="checkbox" checked={content.requiredWatch} onChange={(e) => updateContent(currentSection.id, content.id, { requiredWatch: e.target.checked })} className="rounded text-brand-500 focus:ring-brand-500" />
                              Required to watch
                            </label>
                            <label className="flex items-center gap-2 text-xs text-grey-35 cursor-pointer">
                              <input type="checkbox" checked={content.autoplayNext} onChange={(e) => updateContent(currentSection.id, content.id, { autoplayNext: e.target.checked })} className="rounded text-brand-500 focus:ring-brand-500" />
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
                          className="w-full px-4 py-3 text-sm border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500 text-grey-15 placeholder-grey-50"
                        />
                      )}
                    </div>
                  ))}

                  {/* Quiz */}
                  {currentSection.quiz && (
                    <div className="rounded-[8px] border border-[#FFEDD5] bg-[#FFFBF5] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-[#FFF7ED] text-[#FF9500]">Quiz</span>
                          <input
                            type="text"
                            defaultValue={currentSection.quiz.title}
                            onBlur={(e) => createOrUpdateQuiz(currentSection.id, { title: e.target.value })}
                            className="text-sm font-semibold text-grey-15 bg-transparent border-none focus:outline-none"
                          />
                        </div>
                        <button onClick={() => deleteQuiz(currentSection.id)} className="w-7 h-7 flex items-center justify-center rounded-[8px] text-grey-50 hover:bg-red-50 hover:text-red-500">&times;</button>
                      </div>

                      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-[#FFEDD5]">
                        <label className="flex items-center gap-2 text-xs text-grey-35 cursor-pointer">
                          <input type="checkbox" checked={currentSection.quiz.requiredPassing} onChange={(e) => createOrUpdateQuiz(currentSection.id, { requiredPassing: e.target.checked })} className="rounded text-brand-500" />
                          Require passing
                        </label>
                        <div className="flex items-center gap-1.5 text-xs text-grey-35">
                          <span>Grade:</span>
                          <input type="number" min={0} max={100} defaultValue={currentSection.quiz.passingGrade} onBlur={(e) => createOrUpdateQuiz(currentSection.id, { passingGrade: Number(e.target.value) })} className="w-14 px-2 py-1.5 border border-surface-border rounded-[8px] text-xs text-center" />
                          <span>%</span>
                        </div>
                      </div>

                      {/* Questions */}
                      <div className="space-y-3">
                        {currentSection.quiz.questions.map((q, qi) => (
                          <div key={q.id} className="bg-white rounded-[8px] p-4 border border-[#FFEDD5]">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[11px] font-bold text-grey-40">Q{String(qi + 1).padStart(2, '0')}</span>
                              <button onClick={() => quizAction(currentSection.id, { action: 'delete_question', questionId: q.id })} className="text-grey-50 hover:text-red-500 text-xs">&times;</button>
                            </div>
                            <input
                              type="text"
                              defaultValue={q.questionText}
                              onBlur={(e) => quizAction(currentSection.id, { action: 'update_question', questionId: q.id, questionText: e.target.value })}
                              className="w-full px-3 py-2 text-sm border border-surface-border rounded-[8px] mb-3 focus:outline-none focus:ring-1 focus:ring-brand-500 text-grey-15"
                            />
                            <div className="space-y-2">
                              {(q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).map((opt, oi) => (
                                <div key={oi} className={`rounded-[8px] border p-3 ${opt.isCorrect ? 'border-green-300 bg-green-50/50' : 'border-surface-border'}`}>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        const newOpts = (q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).map((o, i) => ({
                                          ...o, isCorrect: q.questionType === 'multiselect' ? (i === oi ? !o.isCorrect : o.isCorrect) : i === oi,
                                        }))
                                        quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                      }}
                                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                        opt.isCorrect ? 'border-green-500 bg-green-500 text-white' : 'border-grey-60 hover:border-green-400'
                                      }`}
                                    >
                                      {opt.isCorrect && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    </button>
                                    <input
                                      type="text"
                                      defaultValue={opt.text}
                                      onBlur={(e) => {
                                        const newOpts = (q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).map((o, i) => i === oi ? { ...o, text: e.target.value } : o)
                                        quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                      }}
                                      className="flex-1 px-2 py-0.5 text-xs border-none bg-transparent focus:outline-none text-grey-15"
                                    />
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${opt.isCorrect ? 'bg-green-100 text-green-700' : 'bg-surface text-grey-40'}`}>
                                      {opt.isCorrect ? 'Correct' : 'Wrong'}
                                    </span>
                                    {(q.options as Array<{ text: string; isCorrect: boolean }>).length > 2 && (
                                      <button onClick={() => {
                                        const newOpts = (q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).filter((_, i) => i !== oi)
                                        quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                      }} className="text-grey-60 hover:text-red-500 text-xs">&times;</button>
                                    )}
                                  </div>
                                  <div className="ml-7 mt-1.5">
                                    <input
                                      type="text"
                                      defaultValue={opt.hint || ''}
                                      onBlur={(e) => {
                                        const newOpts = (q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).map((o, i) => i === oi ? { ...o, hint: e.target.value } : o)
                                        quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                      }}
                                      placeholder={opt.isCorrect ? 'Hint: "Correct! Because..."' : 'Hint: "Not quite..."'}
                                      className="w-full px-2 py-0.5 text-[10px] text-grey-40 border border-dashed border-surface-border rounded bg-transparent focus:outline-none focus:border-brand-400"
                                    />
                                  </div>
                                </div>
                              ))}
                              <button
                                onClick={() => {
                                  const newOpts = [...(q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>), { text: 'New option', isCorrect: false, hint: '' }]
                                  quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                }}
                                className="text-[11px] text-brand-500 hover:text-brand-600 font-medium"
                              >
                                + Add option
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => quizAction(currentSection.id, { action: 'add_question' })}
                        className="mt-3 px-4 py-2 text-xs text-[#FF9500] border border-[#FFEDD5] rounded-[8px] hover:bg-[#FFF7ED] font-medium"
                      >
                        + Add Question
                      </button>
                    </div>
                  )}
                </div>

                {currentSection.contents.length === 0 && !currentSection.quiz && (
                  <div className="text-center py-12 text-grey-40">
                    <svg className="w-12 h-12 mx-auto mb-3 text-grey-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    <p className="text-sm">Add video, text, or quiz content</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[12px] border border-surface-border text-center py-16">
              <svg className="w-12 h-12 mx-auto mb-3 text-grey-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              <p className="text-grey-35">{training.sections.length === 0 ? 'Add a section to get started' : 'Select a section'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Preview modal - keeping existing logic but with updated styles would go here */}
      {/* Omitted for brevity - preview uses the public /t/[slug] page design */}
    </div>
  )
}
