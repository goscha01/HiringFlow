'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { type BrandingConfig, mergeBranding } from '@/lib/branding'

interface ContentItem { id: string; type: string; videoUrl: string | null; videoName: string | null; requiredWatch: boolean; autoplayNext: boolean; textContent: string | null }
interface QuizOption { index: number; text: string }
interface QuizQuestion { id: string; questionText: string; questionType: string; options: QuizOption[] }
interface Quiz { id: string; title: string; requiredPassing: boolean; passingGrade: number; questions: QuizQuestion[] }
interface Section { id: string; title: string; contents: ContentItem[]; quiz: Quiz | null }
interface TrainingData { id: string; title: string; description: string | null; coverImage: string | null; branding: Record<string, unknown> | null; passingGrade: number; sections: Section[] }
interface QuizResult { questionId: string; isCorrect: boolean; correctIndices: number[]; hints: (string | null)[] }

export default function TrainingPage() {
  const params = useParams()
  const slug = params.slug as string

  const [training, setTraining] = useState<TrainingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [started, setStarted] = useState(false)
  const [sectionIdx, setSectionIdx] = useState(0)
  const [contentIdx, setContentIdx] = useState(0)
  const [mode, setMode] = useState<'content' | 'quiz'>('content')
  const [videoEnded, setVideoEnded] = useState(false)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number[]>>({})
  const [quizResults, setQuizResults] = useState<{ score: number; correct: number; total: number; passed: boolean; results: QuizResult[] } | null>(null)
  const [submittingQuiz, setSubmittingQuiz] = useState(false)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    fetch(`/api/public/trainings/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setTraining(d); setLoading(false) })
  }, [slug])

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-900"><p className="text-white">Loading...</p></div>
  if (!training) return <div className="min-h-screen flex items-center justify-center bg-gray-900"><p className="text-white">Training not found</p></div>

  const brand = mergeBranding(training.branding as Partial<BrandingConfig> | null)
  const section = training.sections[sectionIdx]
  const content = section?.contents[contentIdx]

  const btnStyle: React.CSSProperties = {
    backgroundColor: brand.buttons.style === 'filled' ? brand.colors.primary : 'transparent',
    color: brand.buttons.style === 'filled' ? '#fff' : brand.colors.primary,
    border: brand.buttons.style === 'outline' ? `2px solid ${brand.colors.primary}` : 'none',
    borderRadius: brand.buttons.shape === 'pill' ? '9999px' : brand.buttons.shape === 'square' ? '4px' : '12px',
    padding: '12px 24px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', width: '100%',
  }

  const goNext = () => {
    setVideoEnded(false)
    if (section && contentIdx < section.contents.length - 1) {
      setContentIdx(contentIdx + 1)
    } else if (section?.quiz && mode === 'content') {
      setMode('quiz')
      setQuizAnswers({})
      setQuizResults(null)
    } else if (sectionIdx < training.sections.length - 1) {
      setSectionIdx(sectionIdx + 1)
      setContentIdx(0)
      setMode('content')
      setQuizAnswers({})
      setQuizResults(null)
    } else {
      setCompleted(true)
    }
  }

  const submitQuiz = async () => {
    if (!section?.quiz) return
    setSubmittingQuiz(true)
    const res = await fetch(`/api/public/trainings/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizId: section.quiz.id, answers: quizAnswers }),
    })
    if (res.ok) setQuizResults(await res.json())
    setSubmittingQuiz(false)
  }

  // Start screen
  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: brand.colors.background, fontFamily: brand.typography.fontFamily }}>
        <div className="max-w-lg w-full text-center">
          {training.coverImage && <img src={training.coverImage} alt="" className="w-full h-48 object-cover rounded-xl mb-6" />}
          <h1 className="text-3xl font-bold mb-3" style={{ color: brand.colors.text }}>{training.title}</h1>
          {training.description && <p className="mb-2" style={{ color: brand.colors.secondaryText }}>{training.description}</p>}
          <p className="text-sm mb-6" style={{ color: brand.colors.secondaryText }}>{training.sections.length} sections</p>
          <button onClick={() => setStarted(true)} style={btnStyle}>Start Training</button>
        </div>
      </div>
    )
  }

  // Completed screen
  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: brand.colors.background, fontFamily: brand.typography.fontFamily }}>
        <div className="max-w-lg w-full text-center">
          <svg className="w-20 h-20 mx-auto mb-4" style={{ color: brand.colors.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-3xl font-bold mb-3" style={{ color: brand.colors.text }}>Training Complete!</h1>
          <p style={{ color: brand.colors.secondaryText }}>You have completed all sections.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: brand.colors.background, fontFamily: brand.typography.fontFamily }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${brand.colors.text}15` }}>
        <div>
          <h2 className="font-semibold text-sm" style={{ color: brand.colors.text }}>{training.title}</h2>
          <p className="text-xs" style={{ color: brand.colors.secondaryText }}>{section?.title}</p>
        </div>
        <span className="text-xs" style={{ color: brand.colors.secondaryText }}>
          {sectionIdx + 1} / {training.sections.length}
        </span>
      </div>

      {/* Progress */}
      <div className="flex gap-1 px-6 py-2">
        {training.sections.map((_, i) => (
          <div key={i} className="flex-1 h-1 rounded-full" style={{ backgroundColor: i <= sectionIdx ? brand.colors.primary : `${brand.colors.text}20` }} />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto w-full">
        {mode === 'content' && content ? (
          <div>
            {content.type === 'video' && content.videoUrl ? (
              <div className="mb-4">
                <video
                  key={content.id}
                  src={content.videoUrl}
                  controls
                  autoPlay={content.autoplayNext}
                  onEnded={() => setVideoEnded(true)}
                  className="w-full rounded-lg"
                />
                {content.requiredWatch && !videoEnded && (
                  <p className="text-xs mt-2 text-center" style={{ color: brand.colors.secondaryText }}>Watch the video to continue</p>
                )}
              </div>
            ) : content.type === 'text' && content.textContent ? (
              <div className="prose prose-sm max-w-none mb-4 whitespace-pre-wrap" style={{ color: brand.colors.text }}>{content.textContent}</div>
            ) : null}

            <div className="mt-6">
              <button
                onClick={goNext}
                disabled={content.type === 'video' && content.requiredWatch && !videoEnded}
                style={{ ...btnStyle, opacity: (content.type === 'video' && content.requiredWatch && !videoEnded) ? 0.4 : 1 }}
              >
                {contentIdx < section.contents.length - 1 ? 'Next' : section.quiz ? 'Take Quiz' : sectionIdx < training.sections.length - 1 ? 'Next Section' : 'Complete'}
              </button>
            </div>
          </div>
        ) : mode === 'quiz' && section?.quiz ? (
          <div>
            <h3 className="text-xl font-semibold mb-1" style={{ color: brand.colors.text }}>{section.quiz.title}</h3>
            <p className="text-sm mb-6" style={{ color: brand.colors.secondaryText }}>Passing grade: {section.quiz.passingGrade}%</p>

            <div className="space-y-5">
              {section.quiz.questions.map((q, qi) => {
                const selected = quizAnswers[q.id] || []
                const result = quizResults?.results.find(r => r.questionId === q.id)

                return (
                  <div key={q.id}>
                    <p className="font-medium mb-2" style={{ color: brand.colors.text }}>{qi + 1}. {q.questionText}</p>
                    <div className="space-y-2">
                      {q.options.map((opt) => {
                        const isSelected = selected.includes(opt.index)
                        let bg = `${brand.colors.text}08`
                        let border = `${brand.colors.text}20`
                        if (result) {
                          if (isSelected && result.correctIndices.includes(opt.index)) { bg = '#dcfce7'; border = '#86efac' }
                          else if (isSelected && !result.correctIndices.includes(opt.index)) { bg = '#fee2e2'; border = '#fca5a5' }
                          else if (result.correctIndices.includes(opt.index)) { bg = '#dcfce7'; border = '#bbf7d0' }
                        } else if (isSelected) { bg = `${brand.colors.primary}15`; border = brand.colors.primary }

                        return (
                          <div key={opt.index}>
                            <button
                              onClick={() => {
                                if (quizResults) return
                                if (q.questionType === 'multiselect') {
                                  setQuizAnswers(prev => ({ ...prev, [q.id]: isSelected ? selected.filter(i => i !== opt.index) : [...selected, opt.index] }))
                                } else {
                                  setQuizAnswers(prev => ({ ...prev, [q.id]: [opt.index] }))
                                }
                              }}
                              className="w-full text-left px-4 py-3 rounded-lg text-sm transition-colors"
                              style={{ backgroundColor: bg, border: `1.5px solid ${border}`, color: brand.colors.text }}
                            >
                              {opt.text}
                              {result && isSelected && result.correctIndices.includes(opt.index) && <span className="float-right text-green-600">✓</span>}
                              {result && isSelected && !result.correctIndices.includes(opt.index) && <span className="float-right text-red-600">✗</span>}
                            </button>
                            {result && isSelected && result.hints[opt.index] && (
                              <p className={`text-xs mt-1 ml-3 ${result.correctIndices.includes(opt.index) ? 'text-green-600' : 'text-red-600'}`}>
                                {result.hints[opt.index]}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6">
              {quizResults ? (
                <div className="text-center mb-4">
                  <p className="text-lg font-semibold" style={{ color: quizResults.passed ? '#16a34a' : '#dc2626' }}>
                    {quizResults.score}% — {quizResults.passed ? 'Passed!' : 'Not passed'}
                  </p>
                  <p className="text-sm" style={{ color: brand.colors.secondaryText }}>{quizResults.correct} of {quizResults.total} correct</p>
                  <div className="flex gap-3 mt-4 justify-center">
                    <button onClick={() => { setQuizAnswers({}); setQuizResults(null) }} className="px-4 py-2 text-sm rounded-lg" style={{ border: `1px solid ${brand.colors.text}30`, color: brand.colors.text }}>
                      Retry
                    </button>
                    <button onClick={goNext} style={{ ...btnStyle, width: 'auto' }}>
                      {sectionIdx < training.sections.length - 1 ? 'Next Section' : 'Complete'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={submitQuiz}
                  disabled={submittingQuiz || Object.keys(quizAnswers).length < section.quiz.questions.length}
                  style={{ ...btnStyle, opacity: (submittingQuiz || Object.keys(quizAnswers).length < section.quiz.questions.length) ? 0.4 : 1 }}
                >
                  {submittingQuiz ? 'Checking...' : 'Submit Quiz'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12" style={{ color: brand.colors.secondaryText }}>
            <button onClick={goNext} style={btnStyle}>Continue</button>
          </div>
        )}
      </div>
    </div>
  )
}
