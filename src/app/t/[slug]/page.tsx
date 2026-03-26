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
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/public/trainings/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setTraining(d); setLoading(false) })
  }, [slug])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]">
      <div className="w-8 h-8 border-3 border-[#FF9500] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!training) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]">
      <p className="text-[#59595A] text-lg">Training not found</p>
    </div>
  )

  const brand = mergeBranding(training.branding as Partial<BrandingConfig> | null)
  const section = training.sections[sectionIdx]
  const content = section?.contents[contentIdx]
  const totalContents = training.sections.reduce((sum, s) => sum + s.contents.length + (s.quiz ? 1 : 0), 0)

  const goNext = () => {
    setVideoEnded(false)
    if (section && contentIdx < section.contents.length - 1) {
      setContentIdx(contentIdx + 1)
    } else if (section?.quiz && mode === 'content') {
      setMode('quiz'); setQuizAnswers({}); setQuizResults(null)
    } else if (sectionIdx < training.sections.length - 1) {
      setSectionIdx(sectionIdx + 1); setContentIdx(0); setMode('content'); setQuizAnswers({}); setQuizResults(null)
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

  // === LANDING PAGE (not started) ===
  if (!started) {
    return (
      <div className="min-h-screen bg-[#F7F7F8]" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
        {/* Navbar */}
        <nav className="bg-white border-b border-[#F1F1F3]">
          <div className="max-w-[1596px] mx-auto px-6 lg:px-[80px] flex items-center justify-between h-[72px]">
            <div className="w-[44px] h-[44px] bg-[#FF9500] rounded-[8px] flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
            </div>
            <button onClick={() => setStarted(true)} className="px-6 py-3 bg-[#FF9500] text-white font-medium rounded-[8px] hover:bg-[#EA8500] transition-colors">
              Enroll Now
            </button>
          </div>
        </nav>

        {/* Hero */}
        <div className="max-w-[1596px] mx-auto px-6 lg:px-[80px] border-b border-[#E4E4E7]">
          <div className="flex flex-col lg:flex-row items-start gap-[100px] py-10 lg:py-[50px]">
            <div className="lg:flex-1">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[#FF9500]">✦</span>
                <span className="text-sm text-[#FF9500] font-medium">Training Program</span>
              </div>
              <h1 className="text-[36px] lg:text-[48px] font-semibold text-[#262626] leading-[1.3] mb-4">
                {training.title}
              </h1>
              {training.description && (
                <p className="text-lg text-[#59595A] leading-relaxed mb-8">{training.description}</p>
              )}
              <div className="flex gap-4">
                <button onClick={() => setStarted(true)} className="px-8 py-4 bg-[#FF9500] text-white font-medium rounded-[8px] hover:bg-[#EA8500] transition-colors">
                  Start Training
                </button>
                <button className="px-8 py-4 bg-white border border-[#F1F1F3] text-[#262626] font-medium rounded-[8px] hover:bg-[#F7F7F8] transition-colors">
                  View Pricing
                </button>
              </div>
            </div>
            <div className="lg:flex-1">
              {training.coverImage ? (
                <img src={training.coverImage} alt={training.title} className="w-full rounded-[8px] object-cover max-h-[400px]" />
              ) : (
                <div className="w-full h-[300px] bg-[#E4E4E7] rounded-[8px] flex items-center justify-center">
                  <svg className="w-16 h-16 text-[#B0B0B2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="max-w-[1596px] mx-auto px-6 lg:px-[80px] py-10">
          <div className="bg-white rounded-[12px] border border-[#F1F1F3]">
            <div className="px-8 py-6 border-b border-[#F1F1F3]">
              <h2 className="text-[22px] font-semibold text-[#262626]">Program Overview</h2>
            </div>
            <div className="flex flex-wrap items-start px-[50px] py-8 gap-y-6">
              {[
                { num: String(training.sections.length).padStart(2, '0'), label: 'Sections' },
                { num: String(totalContents).padStart(2, '0'), label: 'Lessons & Quizzes' },
                { num: '∞', label: 'Lifetime Access' },
              ].map((item, i, arr) => (
                <div key={i} className="flex items-start flex-1 min-w-[140px]">
                  <div>
                    <div className="text-[50px] font-extrabold text-[#262626] leading-none">{item.num}</div>
                    <div className="text-lg text-[#333333] font-medium mt-3">{item.label}</div>
                  </div>
                  {i < arr.length - 1 && <div className="hidden lg:block w-px h-[80px] bg-[#F1F1F3] mx-[50px]" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Course Content / Sections */}
        <div className="max-w-[1596px] mx-auto px-6 lg:px-[80px] pb-10">
          <div className="bg-white rounded-[12px] p-8 lg:p-[50px]">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-[24px] font-semibold text-[#262626] mb-2">Course Content</h2>
                <p className="text-lg text-[#59595A]">Explore the sections and lessons included in this program.</p>
              </div>
              <button onClick={() => setStarted(true)} className="hidden lg:flex px-6 py-4 bg-white border border-[#F1F1F3] text-[#262626] font-medium rounded-[8px] hover:bg-[#F7F7F8] transition-colors">
                Start Learning
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {training.sections.map((s, i) => (
                <div key={s.id} className="border border-[#F1F1F3] rounded-[8px] overflow-hidden hover:shadow-md transition-shadow">
                  {/* Section image placeholder */}
                  <div className="h-[180px] bg-gradient-to-br from-[#FF9500]/10 to-[#FF9500]/5 flex items-center justify-center">
                    <span className="text-[64px] font-extrabold text-[#FF9500]/20">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs px-2.5 py-1 bg-[#F7F7F8] border border-[#F1F1F3] rounded-[8px] text-[#59595A]">
                        {s.contents.length} lessons
                      </span>
                      {s.quiz && (
                        <span className="text-xs px-2.5 py-1 bg-[#FFF7ED] border border-[#FFEDD5] rounded-[8px] text-[#FF9500]">
                          Quiz
                        </span>
                      )}
                    </div>
                    <h3 className="text-[16px] font-semibold text-[#262626] mb-2">{s.title}</h3>
                    <p className="text-sm text-[#59595A] mb-4 line-clamp-2">
                      Section {i + 1} with {s.contents.length} lessons{s.quiz ? ' and a quiz' : ''}.
                    </p>
                    <button
                      onClick={() => { setSectionIdx(i); setContentIdx(0); setMode('content'); setStarted(true) }}
                      className="text-sm text-[#FF9500] font-medium hover:text-[#EA8500] transition-colors"
                    >
                      Start Section →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-[1596px] mx-auto px-6 lg:px-[80px] pb-10">
          <div className="bg-white rounded-[12px] p-8 lg:p-[50px]">
            <div className="lg:flex gap-[80px]">
              <div className="lg:w-[400px] mb-8 lg:mb-0">
                <h2 className="text-[36px] font-semibold text-[#262626] leading-tight mb-4">Frequently<br/>Asked Questions</h2>
                <p className="text-[#59595A] mb-6">Find answers about this training program.</p>
                <button className="px-6 py-3 bg-white border border-[#F1F1F3] text-[#262626] font-medium rounded-[8px] hover:bg-[#F7F7F8]">
                  See All FAQ&apos;s
                </button>
              </div>
              <div className="flex-1 space-y-0">
                {[
                  { q: 'What will I learn in this training?', a: `This training covers ${training.sections.length} sections with video lessons, text content, and quizzes to test your knowledge.` },
                  { q: 'How long does it take to complete?', a: 'You can complete this training at your own pace. Most participants finish within a few hours.' },
                  { q: 'Is there a certificate upon completion?', a: 'Yes, you will receive a certificate after completing all sections and passing the quizzes.' },
                  { q: 'Can I retake quizzes?', a: 'Yes, you can retake quizzes as many times as needed to achieve the passing grade.' },
                ].map((faq, i) => (
                  <div key={i} className="border-b border-[#F1F1F3]">
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                      className="w-full flex items-center justify-between py-5 text-left"
                    >
                      <span className="text-[#262626] font-medium pr-4">{faq.q}</span>
                      <svg className={`w-5 h-5 text-[#59595A] flex-shrink-0 transition-transform ${expandedFaq === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expandedFaq === i && (
                      <p className="pb-5 text-[#59595A] leading-relaxed">{faq.a}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-white border-t border-[#F1F1F3]">
          <div className="max-w-[1596px] mx-auto px-6 lg:px-[80px] py-10">
            <div className="flex flex-col lg:flex-row justify-between gap-10">
              <div>
                <div className="w-[44px] h-[44px] bg-[#FF9500] rounded-[8px] flex items-center justify-center mb-6">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
                </div>
                <p className="text-[#59595A] text-sm max-w-[300px]">Video-based training and interview platform.</p>
              </div>
              <div className="grid grid-cols-2 gap-10">
                <div>
                  <h4 className="text-[#262626] font-semibold mb-4">Training</h4>
                  <div className="space-y-2 text-sm text-[#59595A]">
                    <p>Course Content</p>
                    <p>Quizzes</p>
                    <p>Certificates</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-[#262626] font-semibold mb-4">Support</h4>
                  <div className="space-y-2 text-sm text-[#59595A]">
                    <p>FAQ</p>
                    <p>Contact</p>
                    <p>Help Center</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-[#F1F1F3] mt-10 pt-6 text-center text-sm text-[#656567]">
              &copy; {new Date().getFullYear()} HiringFlow. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    )
  }

  // === COMPLETED ===
  if (completed) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-6" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
        <div className="bg-white rounded-[12px] p-12 max-w-lg text-center border border-[#F1F1F3]">
          <div className="w-20 h-20 mx-auto mb-6 bg-[#FFF7ED] rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-[#FF9500]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-[36px] font-semibold text-[#262626] mb-3">Training Complete!</h1>
          <p className="text-lg text-[#59595A] mb-8">Congratulations! You have completed all sections.</p>
          <button onClick={() => { setStarted(false); setCompleted(false); setSectionIdx(0); setContentIdx(0) }} className="px-8 py-4 bg-[#FF9500] text-white font-medium rounded-[8px] hover:bg-[#EA8500] transition-colors">
            Back to Overview
          </button>
        </div>
      </div>
    )
  }

  // === ACTIVE LEARNING VIEW ===
  return (
    <div className="min-h-screen bg-[#F7F7F8] flex flex-col" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
      {/* Header */}
      <div className="bg-white border-b border-[#F1F1F3]">
        <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between h-[64px]">
          <div className="flex items-center gap-4">
            <button onClick={() => setStarted(false)} className="text-[#59595A] hover:text-[#262626]">&larr;</button>
            <div>
              <h2 className="text-sm font-semibold text-[#262626]">{training.title}</h2>
              <p className="text-xs text-[#59595A]">{section?.title}</p>
            </div>
          </div>
          <span className="text-xs text-[#59595A] bg-[#F7F7F8] px-3 py-1.5 rounded-[8px]">
            Section {sectionIdx + 1} / {training.sections.length}
          </span>
        </div>
        {/* Progress bar */}
        <div className="flex gap-0.5 px-6 max-w-[1200px] mx-auto pb-2">
          {training.sections.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full" style={{ backgroundColor: i <= sectionIdx ? '#FF9500' : '#E4E4E7' }} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[800px] mx-auto px-6 py-8">
          {mode === 'content' && content ? (
            <div className="bg-white rounded-[12px] p-8 border border-[#F1F1F3]">
              {content.type === 'video' && content.videoUrl ? (
                <div className="mb-6">
                  <video
                    key={content.id}
                    src={content.videoUrl}
                    controls
                    autoPlay={content.autoplayNext}
                    onEnded={() => setVideoEnded(true)}
                    className="w-full rounded-[8px]"
                  />
                  {content.requiredWatch && !videoEnded && (
                    <p className="text-sm mt-3 text-center text-[#59595A]">Watch the video to continue</p>
                  )}
                </div>
              ) : content.type === 'text' && content.textContent ? (
                <div className="prose prose-lg max-w-none text-[#262626] whitespace-pre-wrap mb-6">{content.textContent}</div>
              ) : null}

              <div className="flex items-center justify-between pt-6 border-t border-[#F1F1F3]">
                <span className="text-sm text-[#59595A]">{contentIdx + 1} / {section.contents.length}</span>
                <button
                  onClick={goNext}
                  disabled={content.type === 'video' && content.requiredWatch && !videoEnded}
                  className="px-6 py-3 bg-[#FF9500] text-white font-medium rounded-[8px] hover:bg-[#EA8500] transition-colors disabled:opacity-40"
                >
                  {contentIdx < section.contents.length - 1 ? 'Next' : section.quiz ? 'Take Quiz' : sectionIdx < training.sections.length - 1 ? 'Next Section' : 'Complete'}
                </button>
              </div>
            </div>
          ) : mode === 'quiz' && section?.quiz ? (
            <div className="bg-white rounded-[12px] p-8 border border-[#F1F1F3]">
              <div className="mb-6">
                <h3 className="text-[24px] font-semibold text-[#262626] mb-1">{section.quiz.title}</h3>
                <p className="text-sm text-[#59595A]">Passing grade: {section.quiz.passingGrade}%</p>
              </div>

              <div className="space-y-6">
                {section.quiz.questions.map((q, qi) => {
                  const selected = quizAnswers[q.id] || []
                  const result = quizResults?.results.find(r => r.questionId === q.id)
                  return (
                    <div key={q.id} className="border border-[#F1F1F3] rounded-[8px] p-5">
                      <p className="font-medium text-[#262626] mb-3">{qi + 1}. {q.questionText}</p>
                      <div className="space-y-2">
                        {q.options.map((opt) => {
                          const isSelected = selected.includes(opt.index)
                          let borderColor = '#F1F1F3'
                          let bgColor = 'transparent'
                          if (result) {
                            if (isSelected && result.correctIndices.includes(opt.index)) { borderColor = '#22c55e'; bgColor = '#f0fdf4' }
                            else if (isSelected && !result.correctIndices.includes(opt.index)) { borderColor = '#ef4444'; bgColor = '#fef2f2' }
                            else if (result.correctIndices.includes(opt.index)) { borderColor = '#bbf7d0'; bgColor = '#f0fdf4' }
                          } else if (isSelected) { borderColor = '#FF9500'; bgColor = '#FFF7ED' }

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
                                className="w-full text-left px-4 py-3 rounded-[8px] text-sm transition-colors"
                                style={{ border: `1.5px solid ${borderColor}`, backgroundColor: bgColor }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[#262626]">{opt.text}</span>
                                  {result && isSelected && result.correctIndices.includes(opt.index) && <span className="text-green-600 text-xs font-medium">✓ Correct</span>}
                                  {result && isSelected && !result.correctIndices.includes(opt.index) && <span className="text-red-600 text-xs font-medium">✗ Wrong</span>}
                                </div>
                              </button>
                              {result && isSelected && result.hints[opt.index] && (
                                <p className={`text-xs mt-1 ml-4 ${result.correctIndices.includes(opt.index) ? 'text-green-600' : 'text-red-600'}`}>
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

              <div className="mt-8 pt-6 border-t border-[#F1F1F3]">
                {quizResults ? (
                  <div className="text-center">
                    <div className={`text-[36px] font-bold mb-2 ${quizResults.passed ? 'text-green-600' : 'text-red-600'}`}>
                      {quizResults.score}%
                    </div>
                    <p className={`text-lg font-medium mb-1 ${quizResults.passed ? 'text-green-600' : 'text-red-600'}`}>
                      {quizResults.passed ? 'Passed!' : 'Not Passed'}
                    </p>
                    <p className="text-sm text-[#59595A] mb-6">{quizResults.correct} of {quizResults.total} correct</p>
                    <div className="flex justify-center gap-3">
                      <button onClick={() => { setQuizAnswers({}); setQuizResults(null) }} className="px-6 py-3 border border-[#F1F1F3] text-[#262626] rounded-[8px] hover:bg-[#F7F7F8]">
                        Retry
                      </button>
                      <button onClick={goNext} className="px-6 py-3 bg-[#FF9500] text-white rounded-[8px] hover:bg-[#EA8500]">
                        {sectionIdx < training.sections.length - 1 ? 'Next Section' : 'Complete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={submitQuiz}
                    disabled={submittingQuiz || Object.keys(quizAnswers).length < section.quiz.questions.length}
                    className="w-full py-4 bg-[#FF9500] text-white font-medium rounded-[8px] hover:bg-[#EA8500] transition-colors disabled:opacity-40"
                  >
                    {submittingQuiz ? 'Checking...' : 'Submit Quiz'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[12px] p-8 border border-[#F1F1F3] text-center">
              <button onClick={goNext} className="px-6 py-3 bg-[#FF9500] text-white rounded-[8px] hover:bg-[#EA8500]">Continue</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
