'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { uploadVideoFile } from '@/lib/upload-client'

interface Video { id: string; filename: string; url: string; displayName?: string | null }
interface Content { id: string; type: string; sortOrder: number; videoId: string | null; video: Video | null; requiredWatch: boolean; autoplayNext: boolean; textContent: string | null }
interface Question { id: string; questionText: string; questionType: string; sortOrder: number; options: Array<{ text: string; isCorrect: boolean }> }
interface Quiz { id: string; title: string; requiredPassing: boolean; passingGrade: number; questions: Question[] }
interface Section { id: string; title: string; sortOrder: number; contents: Content[]; quiz: Quiz | null }
interface Training { id: string; title: string; slug: string; description: string | null; isPublished: boolean; timeLimit: Record<string, unknown> | null; pricing: Record<string, unknown> | null; passingGrade: number; sections: Section[] }

export default function TrainingEditorPage() {
  const params = useParams()
  const router = useRouter()
  const trainingId = params.id as string

  const [training, setTraining] = useState<Training | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [editingQuiz, setEditingQuiz] = useState<string | null>(null)

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

  if (loading || !training) return <div className="text-center py-12 text-gray-500">Loading...</div>

  const currentSection = training.sections.find(s => s.id === activeSection)

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
            onClick={() => updateTraining({ isPublished: !training.isPublished })}
            className={`px-4 py-2 text-sm rounded-lg font-medium ${
              training.isPublished ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {training.isPublished ? 'Published' : 'Publish'}
          </button>
        </div>
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
                <input
                  type="text"
                  defaultValue={currentSection.title}
                  onBlur={(e) => { if (e.target.value !== currentSection.title) updateSection(currentSection.id, { title: e.target.value }) }}
                  className="text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none"
                />
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
                        <select
                          value={content.videoId || ''}
                          onChange={(e) => updateContent(currentSection.id, content.id, { videoId: e.target.value || null })}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        >
                          <option value="">Select video...</option>
                          {videos.map(v => (
                            <option key={v.id} value={v.id}>{v.displayName || v.filename}</option>
                          ))}
                        </select>
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
                          <div className="space-y-1">
                            {(q.options as Array<{ text: string; isCorrect: boolean }>).map((opt, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                <input
                                  type={q.questionType === 'multiselect' ? 'checkbox' : 'radio'}
                                  name={`q-${q.id}`}
                                  checked={opt.isCorrect}
                                  onChange={() => {
                                    const newOpts = (q.options as Array<{ text: string; isCorrect: boolean }>).map((o, i) => ({
                                      ...o,
                                      isCorrect: q.questionType === 'multiselect' ? (i === oi ? !o.isCorrect : o.isCorrect) : i === oi,
                                    }))
                                    quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                  }}
                                  className="h-3 w-3"
                                />
                                <input
                                  type="text"
                                  defaultValue={opt.text}
                                  onBlur={(e) => {
                                    const newOpts = (q.options as Array<{ text: string; isCorrect: boolean }>).map((o, i) => i === oi ? { ...o, text: e.target.value } : o)
                                    quizAction(currentSection.id, { action: 'update_question', questionId: q.id, options: newOpts })
                                  }}
                                  className={`flex-1 px-2 py-0.5 text-xs border rounded ${opt.isCorrect ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}
                                />
                              </div>
                            ))}
                            <button
                              onClick={() => {
                                const newOpts = [...(q.options as Array<{ text: string; isCorrect: boolean }>), { text: 'New option', isCorrect: false }]
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
    </div>
  )
}
