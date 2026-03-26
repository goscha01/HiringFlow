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
  const [activeLesson, setActiveLesson] = useState<{ sectionIdx: number; contentIdx: number } | null>(null)

  useEffect(() => {
    fetch(`/api/public/trainings/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setTraining(d); setLoading(false) })
  }, [slug])

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]"><div className="w-8 h-8 border-3 border-[#FF9500] border-t-transparent rounded-full animate-spin" /></div>
  if (!training) return <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]"><p className="text-[#59595A] text-lg">Training not found</p></div>

  const brand = mergeBranding(training.branding as Partial<BrandingConfig> | null)
  const section = training.sections[sectionIdx]
  const content = section?.contents[contentIdx]

  const goNext = () => {
    setVideoEnded(false)
    if (section && contentIdx < section.contents.length - 1) { setContentIdx(contentIdx + 1) }
    else if (section?.quiz && mode === 'content') { setMode('quiz'); setQuizAnswers({}); setQuizResults(null) }
    else if (sectionIdx < training.sections.length - 1) { setSectionIdx(sectionIdx + 1); setContentIdx(0); setMode('content'); setQuizAnswers({}); setQuizResults(null) }
    else { setCompleted(true) }
  }

  const submitQuiz = async () => {
    if (!section?.quiz) return
    setSubmittingQuiz(true)
    const res = await fetch(`/api/public/trainings/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quizId: section.quiz.id, answers: quizAnswers }) })
    if (res.ok) setQuizResults(await res.json())
    setSubmittingQuiz(false)
  }

  const startAtSection = (si: number) => { setSectionIdx(si); setContentIdx(0); setMode('content'); setStarted(true) }

  // ===== NAVBAR (shared) =====
  const Navbar = () => (
    <>
      <div className="bg-[#FF9500] text-white text-center py-3 text-sm font-normal">
        Free Courses · Start Learning Now
        <span className="ml-2">→</span>
      </div>
      <nav className="bg-white border-b border-[#F1F1F3]">
        <div className="max-w-[1596px] mx-auto px-6 lg:px-[80px] flex items-center justify-between h-[72px]">
          <div className="flex items-center gap-10">
            <div className="w-[44px] h-[44px] bg-[#FF9500] rounded-[8px] flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
            </div>
            <div className="hidden md:flex items-center gap-1">
              {['Home', 'Courses', 'About Us', 'Pricing', 'Contact'].map((item, i) => (
                <span key={i} className={`px-4 py-2 rounded-[8px] text-sm ${i === 1 ? 'bg-[#F7F7F8] font-medium text-[#262626]' : 'text-[#262626]'}`}>{item}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#262626]">Sign Up</span>
            <button onClick={() => setStarted(true)} className="px-6 py-3 bg-[#FF9500] text-white text-sm font-medium rounded-[8px] hover:bg-[#EA8500]">Login</button>
          </div>
        </div>
      </nav>
    </>
  )

  // ===== FOOTER (shared) =====
  const Footer = () => (
    <footer className="bg-white border-t border-[#F1F1F3] mt-auto">
      <div className="max-w-[1596px] mx-auto px-6 lg:px-[80px] py-[60px]">
        <div className="flex flex-col lg:flex-row justify-between gap-10">
          <div>
            <div className="w-[44px] h-[44px] bg-[#FF9500] rounded-[8px] flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
            </div>
            <div className="space-y-3 text-sm text-[#262626]">
              <div className="flex items-center gap-2"><span>✉</span> hello@hiringflow.com</div>
              <div className="flex items-center gap-2"><span>☎</span> +1 (555) 123-4567</div>
              <div className="flex items-center gap-2"><span>📍</span> Somewhere in the World</div>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-8">
            <div>
              <h4 className="text-[#262626] font-semibold mb-4 text-lg">Home</h4>
              <div className="space-y-2 text-sm text-[#59595A]"><p>Benefits</p><p>Our Courses</p><p>Our Testimonials</p><p>Our FAQ</p></div>
            </div>
            <div>
              <h4 className="text-[#262626] font-semibold mb-4 text-lg">About Us</h4>
              <div className="space-y-2 text-sm text-[#59595A]"><p>Company</p><p>Achievements</p><p>Our Goals</p></div>
            </div>
            <div>
              <h4 className="text-[#262626] font-semibold mb-4 text-lg">Social Profiles</h4>
              <div className="flex gap-3">
                {['f', 't', 'in'].map((s, i) => (
                  <div key={i} className="w-[52px] h-[52px] bg-[#F7F7F8] border border-[#F1F1F3] rounded-[8px] flex items-center justify-center text-[#333333] text-sm font-bold">{s}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-[#F1F1F3] py-6 text-center text-sm text-[#656567]">
        © {new Date().getFullYear()} HiringFlow. All rights reserved.
      </div>
    </footer>
  )

  // ===== LANDING PAGE =====
  if (!started) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] flex flex-col" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
        <Navbar />

        {/* Hero — title left, description right */}
        <div className="max-w-[1596px] mx-auto w-full px-6 lg:px-[80px]">
          <div className="flex flex-col lg:flex-row items-start gap-[100px] py-8 border-b border-[#E4E4E7]">
            <h1 className="text-[36px] lg:text-[48px] font-semibold text-[#262626] leading-tight lg:flex-1">{training.title}</h1>
            <p className="text-lg text-[#59595A] leading-relaxed lg:flex-1">{training.description || `Welcome to ${training.title}! This comprehensive program will equip you with the knowledge and skills. Dive in and start learning.`}</p>
          </div>
        </div>

        {/* Video / Cover hero */}
        <div className="max-w-[1596px] mx-auto w-full px-6 lg:px-[80px] py-10">
          <div className="relative rounded-[12px] overflow-hidden bg-[#262626]">
            {activeLesson ? (() => {
              const al = training.sections[activeLesson.sectionIdx]?.contents[activeLesson.contentIdx]
              if (al?.type === 'video' && al.videoUrl) {
                return (
                  <video
                    key={`${activeLesson.sectionIdx}-${activeLesson.contentIdx}`}
                    src={al.videoUrl}
                    controls
                    autoPlay
                    className="w-full h-[300px] lg:h-[480px] object-contain bg-black"
                  />
                )
              }
              if (al?.type === 'text' && al.textContent) {
                return (
                  <div className="w-full h-[300px] lg:h-[480px] overflow-y-auto p-10 bg-white">
                    <div className="max-w-[700px] mx-auto text-[#262626] text-lg leading-relaxed whitespace-pre-wrap">{al.textContent}</div>
                  </div>
                )
              }
              return <div className="w-full h-[300px] lg:h-[480px] flex items-center justify-center text-[#59595A]">No content</div>
            })() : (
              <>
                {training.coverImage ? (
                  <img src={training.coverImage} alt="" className="w-full h-[300px] lg:h-[480px] object-cover" />
                ) : (
                  <div className="w-full h-[300px] lg:h-[480px] bg-gradient-to-br from-[#333] to-[#1a1a1a]" />
                )}
                {/* Play button overlay */}
                <button
                  onClick={() => {
                    // Find first video content
                    for (let si = 0; si < training.sections.length; si++) {
                      for (let ci = 0; ci < training.sections[si].contents.length; ci++) {
                        if (training.sections[si].contents[ci].videoUrl) {
                          setActiveLesson({ sectionIdx: si, contentIdx: ci })
                          return
                        }
                      }
                    }
                    startAtSection(0)
                  }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
                    <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                </button>
              </>
            )}
          </div>
          {/* Active lesson info bar */}
          {activeLesson && (() => {
            const al = training.sections[activeLesson.sectionIdx]?.contents[activeLesson.contentIdx]
            const sectionTitle = training.sections[activeLesson.sectionIdx]?.title
            return (
              <div className="flex items-center justify-between mt-4 px-1">
                <div>
                  <p className="text-sm font-medium text-[#262626]">{al?.videoName || al?.textContent?.slice(0, 40) || 'Lesson'}</p>
                  <p className="text-xs text-[#59595A]">{sectionTitle} · Lesson {String(activeLesson.contentIdx + 1).padStart(2, '0')}</p>
                </div>
                <div className="flex gap-2">
                  {/* Prev */}
                  <button
                    onClick={() => {
                      if (activeLesson.contentIdx > 0) setActiveLesson({ ...activeLesson, contentIdx: activeLesson.contentIdx - 1 })
                      else if (activeLesson.sectionIdx > 0) {
                        const prevSection = training.sections[activeLesson.sectionIdx - 1]
                        setActiveLesson({ sectionIdx: activeLesson.sectionIdx - 1, contentIdx: prevSection.contents.length - 1 })
                      }
                    }}
                    className="px-4 py-2 text-xs border border-[#F1F1F3] rounded-[8px] text-[#59595A] hover:bg-[#F7F7F8]"
                  >
                    ← Prev
                  </button>
                  {/* Next */}
                  <button
                    onClick={() => {
                      const sec = training.sections[activeLesson.sectionIdx]
                      if (activeLesson.contentIdx < sec.contents.length - 1) setActiveLesson({ ...activeLesson, contentIdx: activeLesson.contentIdx + 1 })
                      else if (activeLesson.sectionIdx < training.sections.length - 1) setActiveLesson({ sectionIdx: activeLesson.sectionIdx + 1, contentIdx: 0 })
                    }}
                    className="px-4 py-2 text-xs bg-[#FF9500] text-white rounded-[8px] hover:bg-[#EA8500]"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Sections — 2-column grid with big numbers */}
        <div className="max-w-[1596px] mx-auto w-full px-6 lg:px-[80px] pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-12">
            {training.sections.map((s, si) => (
              <div key={s.id}>
                {/* Big number */}
                <div className="text-center mb-4">
                  <span className="text-[80px] lg:text-[100px] font-bold text-[#262626] leading-none">{String(si + 1).padStart(2, '0')}</span>
                </div>
                {/* Section title */}
                <h3 className="text-lg font-semibold text-[#262626] mb-4 border-b border-[#E4E4E7] pb-3">{s.title}</h3>
                {/* Lesson rows */}
                <div className="space-y-0">
                  {s.contents.map((c, ci) => {
                    const isActive = activeLesson?.sectionIdx === si && activeLesson?.contentIdx === ci
                    return (
                    <button
                      key={c.id}
                      onClick={() => setActiveLesson({ sectionIdx: si, contentIdx: ci })}
                      className={`w-full flex items-center justify-between py-4 border-b text-left transition-colors group ${
                        isActive
                          ? 'bg-[#FFF7ED] border-[#FFEDD5] -mx-3 px-3 rounded-[8px]'
                          : 'border-[#F1F1F3] hover:bg-[#F7F7F8]'
                      }`}
                    >
                      <div>
                        <div className={`text-sm font-medium ${isActive ? 'text-[#FF9500]' : 'text-[#262626] group-hover:text-[#FF9500]'}`}>
                          {c.videoName || c.textContent?.slice(0, 50) || `${c.type === 'video' ? 'Video' : 'Text'} Lesson`}
                        </div>
                        <div className="text-xs text-[#59595A] mt-0.5">Lesson {String(ci + 1).padStart(2, '0')}</div>
                      </div>
                      <span className={`text-xs px-3 py-1.5 rounded-[8px] flex items-center gap-1.5 flex-shrink-0 ${
                        isActive
                          ? 'bg-[#FF9500] text-white'
                          : 'border border-[#F1F1F3] text-[#59595A]'
                      }`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {c.type === 'video' ? '1 Hour' : '45 Minutes'}
                      </span>
                    </button>
                    )
                  })}
                  {s.quiz && (
                    <button
                      onClick={() => startAtSection(si)}
                      className="w-full flex items-center justify-between py-4 border-b border-[#F1F1F3] text-left hover:bg-[#FFF7ED] transition-colors"
                    >
                      <div>
                        <div className="text-sm font-medium text-[#FF9500]">{s.quiz.title}</div>
                        <div className="text-xs text-[#59595A] mt-0.5">Quiz · {s.quiz.questions.length} questions</div>
                      </div>
                      <span className="text-xs px-3 py-1.5 bg-[#FF9500] text-white rounded-[8px]">
                        Take Quiz
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Footer />
      </div>
    )
  }

  // ===== COMPLETED =====
  if (completed) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] flex flex-col" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-[12px] p-12 max-w-lg text-center border border-[#F1F1F3]">
            <div className="w-20 h-20 mx-auto mb-6 bg-[#FFF7ED] rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-[#FF9500]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h1 className="text-[36px] font-semibold text-[#262626] mb-3">Training Complete!</h1>
            <p className="text-lg text-[#59595A] mb-8">Congratulations on finishing all sections.</p>
            <button onClick={() => { setStarted(false); setCompleted(false); setSectionIdx(0); setContentIdx(0) }} className="px-8 py-4 bg-[#FF9500] text-white font-medium rounded-[8px] hover:bg-[#EA8500]">
              Back to Overview
            </button>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  // ===== ACTIVE LEARNING =====
  return (
    <div className="min-h-screen bg-[#F7F7F8] flex flex-col" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
      {/* Header */}
      <div className="bg-white border-b border-[#F1F1F3]">
        <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between h-[64px]">
          <div className="flex items-center gap-4">
            <button onClick={() => setStarted(false)} className="w-9 h-9 flex items-center justify-center rounded-[8px] border border-[#F1F1F3] hover:bg-[#F7F7F8]">
              <svg className="w-4 h-4 text-[#59595A]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-[#262626]">{training.title}</h2>
              <p className="text-xs text-[#59595A]">{section?.title}</p>
            </div>
          </div>
          <span className="text-xs text-[#59595A] bg-[#F7F7F8] px-3 py-1.5 rounded-[8px]">
            Section {sectionIdx + 1} / {training.sections.length}
          </span>
        </div>
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
                  <video key={content.id} src={content.videoUrl} controls autoPlay={content.autoplayNext} onEnded={() => setVideoEnded(true)} className="w-full rounded-[8px]" />
                  {content.requiredWatch && !videoEnded && <p className="text-sm mt-3 text-center text-[#59595A]">Watch the video to continue</p>}
                </div>
              ) : content.type === 'text' && content.textContent ? (
                <div className="prose prose-lg max-w-none text-[#262626] whitespace-pre-wrap mb-6">{content.textContent}</div>
              ) : null}
              <div className="flex items-center justify-between pt-6 border-t border-[#F1F1F3]">
                <span className="text-sm text-[#59595A]">{contentIdx + 1} / {section.contents.length}</span>
                <button onClick={goNext} disabled={content.type === 'video' && content.requiredWatch && !videoEnded} className="px-6 py-3 bg-[#FF9500] text-white font-medium rounded-[8px] hover:bg-[#EA8500] disabled:opacity-40">
                  {contentIdx < section.contents.length - 1 ? 'Next' : section.quiz ? 'Take Quiz' : sectionIdx < training.sections.length - 1 ? 'Next Section' : 'Complete'}
                </button>
              </div>
            </div>
          ) : mode === 'quiz' && section?.quiz ? (
            <div className="bg-white rounded-[12px] p-8 border border-[#F1F1F3]">
              <h3 className="text-[24px] font-semibold text-[#262626] mb-1">{section.quiz.title}</h3>
              <p className="text-sm text-[#59595A] mb-6">Passing grade: {section.quiz.passingGrade}%</p>
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
                          let borderColor = '#F1F1F3', bgColor = 'transparent'
                          if (result) {
                            if (isSelected && result.correctIndices.includes(opt.index)) { borderColor = '#22c55e'; bgColor = '#f0fdf4' }
                            else if (isSelected && !result.correctIndices.includes(opt.index)) { borderColor = '#ef4444'; bgColor = '#fef2f2' }
                            else if (result.correctIndices.includes(opt.index)) { borderColor = '#bbf7d0'; bgColor = '#f0fdf4' }
                          } else if (isSelected) { borderColor = '#FF9500'; bgColor = '#FFF7ED' }
                          return (
                            <div key={opt.index}>
                              <button
                                onClick={() => { if (quizResults) return; if (q.questionType === 'multiselect') { setQuizAnswers(prev => ({ ...prev, [q.id]: isSelected ? selected.filter(i => i !== opt.index) : [...selected, opt.index] })) } else { setQuizAnswers(prev => ({ ...prev, [q.id]: [opt.index] })) } }}
                                className="w-full text-left px-4 py-3 rounded-[8px] text-sm transition-colors"
                                style={{ border: `1.5px solid ${borderColor}`, backgroundColor: bgColor }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[#262626]">{opt.text}</span>
                                  {result && isSelected && result.correctIndices.includes(opt.index) && <span className="text-green-600 text-xs font-medium">✓ Correct</span>}
                                  {result && isSelected && !result.correctIndices.includes(opt.index) && <span className="text-red-600 text-xs font-medium">✗ Wrong</span>}
                                </div>
                              </button>
                              {result && isSelected && result.hints[opt.index] && <p className={`text-xs mt-1 ml-4 ${result.correctIndices.includes(opt.index) ? 'text-green-600' : 'text-red-600'}`}>{result.hints[opt.index]}</p>}
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
                    <div className={`text-[36px] font-bold mb-2 ${quizResults.passed ? 'text-green-600' : 'text-red-600'}`}>{quizResults.score}%</div>
                    <p className={`text-lg font-medium mb-1 ${quizResults.passed ? 'text-green-600' : 'text-red-600'}`}>{quizResults.passed ? 'Passed!' : 'Not Passed'}</p>
                    <p className="text-sm text-[#59595A] mb-6">{quizResults.correct} of {quizResults.total} correct</p>
                    <div className="flex justify-center gap-3">
                      <button onClick={() => { setQuizAnswers({}); setQuizResults(null) }} className="px-6 py-3 border border-[#F1F1F3] text-[#262626] rounded-[8px] hover:bg-[#F7F7F8]">Retry</button>
                      <button onClick={goNext} className="px-6 py-3 bg-[#FF9500] text-white rounded-[8px] hover:bg-[#EA8500]">{sectionIdx < training.sections.length - 1 ? 'Next Section' : 'Complete'}</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={submitQuiz} disabled={submittingQuiz || Object.keys(quizAnswers).length < section.quiz.questions.length} className="w-full py-4 bg-[#FF9500] text-white font-medium rounded-[8px] hover:bg-[#EA8500] disabled:opacity-40">
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
