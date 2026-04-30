'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { type BrandingConfig, mergeBranding } from '@/lib/branding'

interface ContentItem { id: string; type: string; videoUrl: string | null; videoName: string | null; videoDurationSeconds: number | null; requiredWatch: boolean; autoplayNext: boolean; textContent: string | null }

function fmtLessonTime(seconds?: number | null): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '—'
  const min = Math.max(1, Math.round(seconds / 60))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
// Per-type, post-redaction option payloads sent to the candidate viewer.
//   choice/multi/image  → { index, text?, imageUrl? }[]
//   text  → { kind: 'text' }
//   number → { kind: 'number' }
//   file  → { kind: 'file', acceptedMimeTypes: string[], maxSizeMb: number }
interface ChoiceQuizOption { index: number; text?: string; imageUrl?: string }
interface QuizQuestion {
  id: string
  questionText: string
  questionType: string
  options: ChoiceQuizOption[] | { kind: 'text' } | { kind: 'number' } | { kind: 'file'; acceptedMimeTypes: string[]; maxSizeMb: number }
}
type FeedbackMode = 'none' | 'correctness' | 'explanation'
interface Quiz { id: string; title: string; requiredPassing: boolean; passingGrade: number; feedbackMode: FeedbackMode; questions: QuizQuestion[] }
interface Section { id: string; title: string; kind: 'video' | 'quiz'; contents: ContentItem[]; quiz: Quiz | null }

// The training editor stores the section's description as the first text-type
// `TrainingContent` row. The viewer must NOT render that as a lesson card —
// otherwise the description shows up as a phantom "Lesson 02". Treat the first
// text content as the section description, everything else as a real lesson.
function sectionDescription(s: Section): string | null {
  return s.contents.find((c) => c.type === 'text')?.textContent || null
}
function sectionLessons(s: Section): ContentItem[] {
  const firstText = s.contents.find((c) => c.type === 'text')
  return s.contents.filter((c) => c !== firstText)
}
interface TrainingData { id: string; title: string; description: string | null; coverImage: string | null; branding: Record<string, unknown> | null; passingGrade: number; accessMode: string; sectionOrder: 'sequential' | 'any'; enrollmentId: string | null; enrollmentStatus: string | null; enrollmentProgress: { completedSections: string[]; quizScores: { sectionId: string; score: number }[] } | null; candidateName: string | null; candidateEmail: string | null; sections: Section[] }
interface QuizResult {
  questionId: string
  isCorrect: boolean
  correctIndices?: number[]
  correctAnswerText?: string | null
  hints?: (string | null)[]
}
// Candidate's answer payload — shape varies by question type.
//   choice/multi/image  → number[] (selected indices)
//   text  → string
//   number → number
//   file  → { url, mimeType, sizeBytes }
type AnswerValue = number[] | string | number | { url: string; mimeType: string; sizeBytes: number } | null

function LessonVideo({ src, requiredWatch, autoPlay, onEnded, className }: {
  src: string
  requiredWatch: boolean
  autoPlay?: boolean
  onEnded?: () => void
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const maxWatchedRef = useRef(0)
  const endedFiredRef = useRef(false)
  const onEndedRef = useRef(onEnded)
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    maxWatchedRef.current = 0
    endedFiredRef.current = false

    const fireEndedOnce = () => {
      if (endedFiredRef.current) return
      endedFiredRef.current = true
      onEndedRef.current?.()
    }

    const isAtEnd = () => {
      if (v.ended) return true
      const dur = v.duration
      if (!Number.isFinite(dur) || dur <= 0) return false
      // Generous threshold: encoders often write a duration slightly beyond
      // the last decodable frame, so timeupdate's last sample can land 1–2s
      // shy of `duration` even when playback has visibly finished.
      return maxWatchedRef.current >= dur - 1.5 || v.currentTime >= dur - 0.25
    }

    const onTimeUpdate = () => {
      if (requiredWatch && v.currentTime > maxWatchedRef.current + 0.5) {
        v.currentTime = maxWatchedRef.current
        return
      }
      if (v.currentTime > maxWatchedRef.current) {
        maxWatchedRef.current = v.currentTime
      }
      if (isAtEnd()) fireEndedOnce()
    }
    const onSeeking = () => {
      if (!requiredWatch) return
      if (v.currentTime > maxWatchedRef.current + 0.5) {
        v.currentTime = maxWatchedRef.current
      }
    }
    const onLoadedMetadata = () => {
      maxWatchedRef.current = 0
      endedFiredRef.current = false
    }
    const onRateChange = () => {
      if (requiredWatch && v.playbackRate > 1) v.playbackRate = 1
    }
    const onNativeEnded = () => fireEndedOnce()
    // Fallback: when the player pauses at the end without firing `ended`
    // (some browsers + MP4 encodings drop the event), check explicitly.
    const onPause = () => { if (isAtEnd()) fireEndedOnce() }

    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('seeking', onSeeking)
    v.addEventListener('seeked', onSeeking)
    v.addEventListener('loadedmetadata', onLoadedMetadata)
    v.addEventListener('ratechange', onRateChange)
    v.addEventListener('ended', onNativeEnded)
    v.addEventListener('pause', onPause)
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('seeking', onSeeking)
      v.removeEventListener('seeked', onSeeking)
      v.removeEventListener('loadedmetadata', onLoadedMetadata)
      v.removeEventListener('ratechange', onRateChange)
      v.removeEventListener('ended', onNativeEnded)
      v.removeEventListener('pause', onPause)
    }
  }, [requiredWatch, src])

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      controlsList={requiredWatch ? 'nodownload noplaybackrate noremoteplayback' : 'nodownload'}
      disablePictureInPicture={requiredWatch}
      autoPlay={autoPlay}
      className={className}
    />
  )
}

export default function TrainingPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const token = searchParams.get('token')
  const preview = searchParams.get('preview')

  const [training, setTraining] = useState<TrainingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [started, setStarted] = useState(false)
  const [sectionIdx, setSectionIdx] = useState(0)
  const [contentIdx, setContentIdx] = useState(0)
  const [mode, setMode] = useState<'content' | 'quiz'>('content')
  const [videoEnded, setVideoEnded] = useState(false)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, AnswerValue>>({})
  const [quizResults, setQuizResults] = useState<{ score: number; correct: number; total: number; passed: boolean; results: QuizResult[] } | null>(null)
  const [submittingQuiz, setSubmittingQuiz] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [activeLesson, setActiveLesson] = useState<{ sectionIdx: number; contentIdx: number } | null>(null)
  const [completedSections, setCompletedSections] = useState<string[]>([])

  useEffect(() => {
    setVideoEnded(false)
  }, [sectionIdx, contentIdx, started, mode, activeLesson?.sectionIdx, activeLesson?.contentIdx])

  useEffect(() => {
    const qs = new URLSearchParams()
    if (token) qs.set('token', token)
    if (preview) qs.set('preview', preview)
    const url = qs.toString()
      ? `/api/public/trainings/${slug}?${qs.toString()}`
      : `/api/public/trainings/${slug}`
    fetch(url)
      .then(async r => {
        if (r.ok) return r.json()
        const err = await r.json().catch(() => ({}))
        if (r.status === 403) {
          setAccessDenied(true)
          setAccessError(err.code === 'TOKEN_REQUIRED' ? 'This training requires an invitation link.' : 'Access unavailable or expired.')
        }
        return null
      })
      .then(d => {
        if (d) {
          setTraining(d)
          if (d.enrollmentProgress?.completedSections) {
            setCompletedSections(d.enrollmentProgress.completedSections)
          }
          if (d.enrollmentStatus === 'completed') {
            setCompleted(true)
          }
        }
        setLoading(false)
      })
  }, [slug, token, preview])

  // Save progress to backend
  const saveProgress = useCallback(async (sections: string[]) => {
    if (!training?.enrollmentId) return
    try {
      await fetch(`/api/public/trainings/${slug}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId: training.enrollmentId, completedSections: sections }),
      })
    } catch { /* silent */ }
  }, [training?.enrollmentId, slug])

  // Mark training completed on backend
  const markCompleted = useCallback(async () => {
    if (!training?.enrollmentId) return
    try {
      await fetch(`/api/public/trainings/${slug}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId: training.enrollmentId }),
      })
    } catch { /* silent */ }
  }, [training?.enrollmentId, slug])

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]"><div className="w-8 h-8 border-3 border-[#FF9500] border-t-transparent rounded-full animate-spin" /></div>

  // Access denied screen
  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)', fontFamily: 'var(--body-font)' }}>
        <div className="bg-white rounded-[14px] border border-surface-border p-10 max-w-[480px] text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center" style={{ background: 'var(--danger-bg)' }}>
            <svg className="w-8 h-8" style={{ color: 'var(--danger-fg)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="font-mono text-[11px] uppercase text-grey-35 mb-2" style={{ letterSpacing: '0.12em' }}>Access unavailable</div>
          <h1 className="text-[22px] font-semibold text-ink mb-2 tracking-tight2">This link isn&apos;t active</h1>
          <p className="text-grey-35 text-[14px] mb-3">{accessError}</p>
          <p className="text-[12px] text-grey-50">If you believe this is an error, contact the person who sent you the invitation.</p>
        </div>
      </div>
    )
  }

  if (!training) return <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]"><p className="text-[#59595A] text-lg">Training not found</p></div>

  const brand = mergeBranding(training.branding as Partial<BrandingConfig> | null)
  const section = training.sections[sectionIdx]
  // contentIdx indexes into the *lesson* list (description-text excluded), not raw contents.
  const sectionLessonList = section ? sectionLessons(section) : []
  const content = sectionLessonList[contentIdx]

  const markSectionComplete = (sectionId: string) => {
    if (!completedSections.includes(sectionId)) {
      const updated = [...completedSections, sectionId]
      setCompletedSections(updated)
      saveProgress(updated)
    }
  }

  const goNext = () => {
    setVideoEnded(false)
    if (!section) return
    // Advance within a video-kind section's lesson list
    if (section.kind === 'video' && contentIdx < sectionLessonList.length - 1) {
      setContentIdx(contentIdx + 1)
      return
    }
    // Video sections complete by reaching the last lesson. Quiz sections are marked on pass in submitQuiz.
    if (section.kind === 'video') markSectionComplete(section.id)

    // markSectionComplete / submitQuiz update completedSections asynchronously;
    // compute the post-update set inline so we can correctly tell whether
    // every section is now done.
    const effectiveCompleted = completedSections.includes(section.id)
      ? completedSections
      : [...completedSections, section.id]
    const allComplete = training.sections.every(s => effectiveCompleted.includes(s.id))

    // Any-order mode: bounce back to landing after each section — except when
    // every section is now complete, which still needs to fire training_completed
    // and show the wrap-up screen.
    if (training.sectionOrder === 'any') {
      if (allComplete) {
        setCompleted(true)
        markCompleted()
      } else {
        setStarted(false)
      }
      return
    }

    const nextIdx = sectionIdx + 1
    if (nextIdx < training.sections.length) {
      const nextKind = training.sections[nextIdx].kind
      setSectionIdx(nextIdx); setContentIdx(0)
      setMode(nextKind === 'quiz' ? 'quiz' : 'content')
      setQuizAnswers({}); setQuizResults(null)
    } else {
      setCompleted(true)
      markCompleted()
    }
  }

  const submitQuiz = async () => {
    if (!section?.quiz) return
    setSubmittingQuiz(true)
    const res = await fetch(`/api/public/trainings/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizId: section.quiz.id, answers: quizAnswers, enrollmentId: training.enrollmentId }),
    })
    if (res.ok) {
      const result = await res.json()
      setQuizResults(result)
      if (result.passed) markSectionComplete(section.id)
    }
    setSubmittingQuiz(false)
  }

  const startAtSection = (si: number) => {
    const s = training?.sections[si]
    const initialMode: 'content' | 'quiz' = s?.kind === 'quiz' ? 'quiz' : 'content'
    setSectionIdx(si); setContentIdx(0); setMode(initialMode)
    setQuizAnswers({}); setQuizResults(null)
    setStarted(true)
  }

  // ===== NAVBAR (candidate context, no menu, no auth) =====
  const candidateInitial = training.candidateName?.trim().charAt(0).toUpperCase() || training.candidateEmail?.trim().charAt(0).toUpperCase() || ''
  const Navbar = () => (
    <nav className="bg-white border-b border-[#F1F1F3]">
      <div className="max-w-[1596px] mx-auto px-6 lg:px-[80px] flex items-center justify-between h-[72px]">
        <div className="flex items-center gap-3">
          <div className="w-[44px] h-[44px] bg-[#FF9500] rounded-[8px] flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
          </div>
        </div>
        {(training.candidateName || training.candidateEmail) && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              {training.candidateName && <div className="text-sm font-medium text-[#262626] leading-tight">{training.candidateName}</div>}
              {training.candidateEmail && <div className="text-xs text-[#59595A] leading-tight">{training.candidateEmail}</div>}
            </div>
            <div className="w-10 h-10 rounded-full bg-[#F1F1F3] flex items-center justify-center text-sm font-medium text-[#262626]">
              {candidateInitial}
            </div>
          </div>
        )}
      </div>
    </nav>
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
        © {new Date().getFullYear()} HireFunnel. All rights reserved.
      </div>
    </footer>
  )

  // ===== LANDING PAGE =====
  if (!started) {
    const totalLessons = training.sections.reduce((sum, s) => sum + sectionLessons(s).length, 0)
    const totalQuizzes = training.sections.filter((s) => s.quiz).length
    const orgName = (training.branding as { orgName?: string } | null)?.orgName || ''
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)', fontFamily: 'var(--body-font)' }}>
        <Navbar />

        {/* Hero — deep green gradient with metadata chips */}
        <div
          className="relative overflow-hidden text-white"
          style={{ background: 'linear-gradient(135deg, #1a3a2e 0%, #2a5a46 55%, #3a7a5e 100%)' }}
        >
          <div
            className="absolute inset-0 opacity-[0.08] pointer-events-none"
            style={{
              background: `repeating-linear-gradient(45deg, rgba(255,255,255,0.3) 0 1px, transparent 1px 28px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.3) 0 1px, transparent 1px 28px)`,
            }}
          />
          <div className="relative max-w-[1596px] mx-auto w-full px-6 lg:px-[80px] py-14 lg:py-20">
            {orgName && (
              <div className="font-mono text-[11px] uppercase text-white/70 mb-3" style={{ letterSpacing: '0.14em' }}>
                {orgName} · Training
              </div>
            )}
            <h1 className="text-[34px] lg:text-[54px] font-semibold leading-[1.08] tracking-tight2 mb-5 max-w-[900px]">
              {training.title}
            </h1>
            {training.description && (
              <p className="text-[15px] lg:text-[17px] text-white/80 leading-relaxed max-w-[720px] mb-6">
                {training.description}
              </p>
            )}
            {/* Meta chips */}
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="font-mono text-[10px] uppercase text-white/80 px-2.5 py-1 rounded-full border border-white/20 bg-white/5" style={{ letterSpacing: '0.12em' }}>
                {training.sections.length} section{training.sections.length === 1 ? '' : 's'}
              </span>
              <span className="font-mono text-[10px] uppercase text-white/80 px-2.5 py-1 rounded-full border border-white/20 bg-white/5" style={{ letterSpacing: '0.12em' }}>
                {totalLessons} lesson{totalLessons === 1 ? '' : 's'}
              </span>
              {totalQuizzes > 0 && (
                <span className="font-mono text-[10px] uppercase text-white/80 px-2.5 py-1 rounded-full border border-white/20 bg-white/5" style={{ letterSpacing: '0.12em' }}>
                  {totalQuizzes} quiz{totalQuizzes === 1 ? '' : 'zes'}
                </span>
              )}
              {training.passingGrade > 0 && (
                <span className="font-mono text-[10px] uppercase text-white/80 px-2.5 py-1 rounded-full border border-white/20 bg-white/5" style={{ letterSpacing: '0.12em' }}>
                  Passing: {training.passingGrade}%
                </span>
              )}
            </div>
            <div className="mt-8">
              <button
                onClick={() => {
                  const firstIncomplete = training.sections.findIndex((x) => !completedSections.includes(x.id))
                  startAtSection(firstIncomplete === -1 ? 0 : firstIncomplete)
                }}
                className="px-6 py-3 rounded-[10px] bg-white text-[color:var(--ink)] font-semibold text-[14px] hover:bg-white/90 transition-colors"
              >
                {completedSections.length > 0 && completedSections.length < training.sections.length ? 'Continue training' : 'Start training'}
              </button>
            </div>
          </div>
        </div>

        {/* Video / Cover hero */}
        <div className="max-w-[1596px] mx-auto w-full px-6 lg:px-[80px] py-10">
          <div className="relative rounded-[12px] overflow-hidden bg-[#262626]">
            {activeLesson ? (() => {
              const alSection = training.sections[activeLesson.sectionIdx]
              const al = alSection ? sectionLessons(alSection)[activeLesson.contentIdx] : undefined
              if (al?.type === 'video' && al.videoUrl) {
                return (
                  <LessonVideo
                    key={`${activeLesson.sectionIdx}-${activeLesson.contentIdx}`}
                    src={al.videoUrl}
                    requiredWatch={al.requiredWatch}
                    autoPlay
                    onEnded={() => setVideoEnded(true)}
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
                    // Find first video lesson (description-text rows excluded).
                    for (let si = 0; si < training.sections.length; si++) {
                      const lessons = sectionLessons(training.sections[si])
                      for (let ci = 0; ci < lessons.length; ci++) {
                        if (lessons[ci].videoUrl) {
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
            const alSection = training.sections[activeLesson.sectionIdx]
            const al = alSection ? sectionLessons(alSection)[activeLesson.contentIdx] : undefined
            const sectionTitle = alSection?.title
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
                        setActiveLesson({ sectionIdx: activeLesson.sectionIdx - 1, contentIdx: Math.max(0, sectionLessons(prevSection).length - 1) })
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
                      const lessons = sectionLessons(sec)
                      if (activeLesson.contentIdx < lessons.length - 1) setActiveLesson({ ...activeLesson, contentIdx: activeLesson.contentIdx + 1 })
                      else if (activeLesson.sectionIdx < training.sections.length - 1) setActiveLesson({ sectionIdx: activeLesson.sectionIdx + 1, contentIdx: 0 })
                    }}
                    disabled={al?.type === 'video' && !videoEnded}
                    className="px-4 py-2 text-xs bg-[#FF9500] text-white rounded-[8px] hover:bg-[#EA8500] disabled:opacity-40 disabled:cursor-not-allowed"
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
            {training.sections.map((s, si) => {
              const isSectionCompleted = completedSections.includes(s.id)
              const firstIncompleteIdx = training.sections.findIndex((x) => !completedSections.includes(x.id))
              const isLocked = training.sectionOrder === 'sequential'
                && !isSectionCompleted
                && firstIncompleteIdx !== -1
                && si > firstIncompleteIdx
              return (
              <div key={s.id} className={isLocked ? 'opacity-50' : ''}>
                {/* Big number */}
                <div className="text-center mb-4 relative">
                  <span className="text-[80px] lg:text-[100px] font-bold text-[#262626] leading-none">{String(si + 1).padStart(2, '0')}</span>
                  {isSectionCompleted && (
                    <span className="absolute top-2 right-2 text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">Completed</span>
                  )}
                  {isLocked && (
                    <span className="absolute top-2 right-2 text-xs px-2 py-1 bg-[#F1F1F3] text-[#59595A] rounded-full font-medium">Locked</span>
                  )}
                </div>
                {/* Section title */}
                <h3 className="text-lg font-semibold text-[#262626] mb-4 border-b border-[#E4E4E7] pb-3">{s.title}</h3>
                {/* Description (first text content) — rendered above the lessons, not as a card. */}
                {sectionDescription(s) && (
                  <p className="text-sm text-[#59595A] mb-4 leading-relaxed whitespace-pre-wrap">{sectionDescription(s)}</p>
                )}
                {/* Body: quiz-kind shows Take Quiz; video-kind lists lessons */}
                <div className="space-y-0">
                  {s.kind === 'quiz' && s.quiz ? (
                    <button
                      onClick={() => { if (!isLocked) startAtSection(si) }}
                      disabled={isLocked}
                      className="w-full flex items-center justify-between py-4 border-b border-[#F1F1F3] text-left hover:bg-[#FFF7ED] transition-colors disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    >
                      <div>
                        <div className="text-sm font-medium text-[#FF9500]">{s.quiz.title}</div>
                        <div className="text-xs text-[#59595A] mt-0.5">Quiz · {s.quiz.questions.length} question{s.quiz.questions.length === 1 ? '' : 's'} · {Math.max(1, s.quiz.questions.length)} min</div>
                      </div>
                      <span className="text-xs px-3 py-1.5 bg-[#FF9500] text-white rounded-[8px]">
                        {isSectionCompleted ? 'Retake' : 'Take Quiz'}
                      </span>
                    </button>
                  ) : (
                    <>
                      {sectionLessons(s).map((c, ci) => {
                        const isActive = activeLesson?.sectionIdx === si && activeLesson?.contentIdx === ci
                        return (
                        <button
                          key={c.id}
                          onClick={() => { if (!isLocked) setActiveLesson({ sectionIdx: si, contentIdx: ci }) }}
                          disabled={isLocked}
                          className={`w-full flex items-center justify-between py-4 border-b text-left transition-colors group disabled:cursor-not-allowed ${
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
                            {c.type === 'video' ? fmtLessonTime(c.videoDurationSeconds) : '—'}
                          </span>
                        </button>
                        )
                      })}
                      {sectionLessons(s).length > 0 && (
                        <button
                          onClick={() => { if (!isLocked) startAtSection(si) }}
                          disabled={isLocked}
                          className="w-full mt-4 px-4 py-2.5 bg-[#FF9500] text-white font-medium text-sm rounded-[8px] hover:bg-[#EA8500] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSectionCompleted ? 'Review section' : 'Start section'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              )
            })}
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
          {training.sections.map((s, i) => (
            <div key={i} className="flex-1 h-1 rounded-full" style={{ backgroundColor: completedSections.includes(s.id) ? '#22c55e' : i <= sectionIdx ? '#FF9500' : '#E4E4E7' }} />
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
                  <LessonVideo
                    key={content.id}
                    src={content.videoUrl}
                    requiredWatch={content.requiredWatch}
                    autoPlay={content.autoplayNext}
                    onEnded={() => setVideoEnded(true)}
                    className="w-full rounded-[8px]"
                  />
                  {!videoEnded && <p className="text-sm mt-3 text-center text-[#59595A]">{content.requiredWatch ? 'Watch the video to continue (skipping ahead is disabled)' : 'Watch the video to continue'}</p>}
                </div>
              ) : content.type === 'text' && content.textContent ? (
                <div className="prose prose-lg max-w-none text-[#262626] whitespace-pre-wrap mb-6">{content.textContent}</div>
              ) : null}
              <div className="flex items-center justify-between pt-6 border-t border-[#F1F1F3]">
                <span className="text-sm text-[#59595A]">{contentIdx + 1} / {sectionLessonList.length}</span>
                <button onClick={goNext} disabled={content.type === 'video' && !videoEnded} className="px-6 py-3 bg-[#FF9500] text-white font-medium rounded-[8px] hover:bg-[#EA8500] disabled:opacity-40">
                  {contentIdx < sectionLessonList.length - 1
                    ? 'Next'
                    : training.sectionOrder === 'any'
                      ? 'Finish section'
                      : sectionIdx < training.sections.length - 1 ? 'Next Section' : 'Complete'}
                </button>
              </div>
            </div>
          ) : mode === 'quiz' && section?.quiz ? (
            <div className="bg-white rounded-[12px] p-8 border border-[#F1F1F3]">
              <h3 className="text-[24px] font-semibold text-[#262626] mb-1">{section.quiz.title}</h3>
              <p className="text-sm text-[#59595A] mb-6">Passing grade: {section.quiz.passingGrade}%</p>
              <div className="space-y-6">
                {section.quiz.questions.map((q, qi) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    index={qi}
                    answer={quizAnswers[q.id]}
                    result={quizResults?.results.find((r) => r.questionId === q.id)}
                    feedbackMode={section.quiz!.feedbackMode || 'correctness'}
                    locked={!!quizResults}
                    slug={slug}
                    preview={preview}
                    token={token}
                    onAnswer={(value) => setQuizAnswers((prev) => ({ ...prev, [q.id]: value }))}
                  />
                ))}
              </div>
              <div className="mt-8 pt-6 border-t border-[#F1F1F3]">
                {quizResults ? (
                  <div className="text-center">
                    <div className={`text-[36px] font-bold mb-2 ${quizResults.passed ? 'text-green-600' : 'text-red-600'}`}>{quizResults.score}%</div>
                    <p className={`text-lg font-medium mb-1 ${quizResults.passed ? 'text-green-600' : 'text-red-600'}`}>{quizResults.passed ? 'Passed!' : 'Not Passed'}</p>
                    <p className="text-sm text-[#59595A] mb-6">{quizResults.correct} of {quizResults.total} correct</p>
                    <div className="flex justify-center gap-3">
                      <button onClick={() => { setQuizAnswers({}); setQuizResults(null) }} className="px-6 py-3 border border-[#F1F1F3] text-[#262626] rounded-[8px] hover:bg-[#F7F7F8]">Retry</button>
                      <button onClick={goNext} disabled={!quizResults.passed} className="px-6 py-3 bg-[#FF9500] text-white rounded-[8px] hover:bg-[#EA8500] disabled:opacity-40 disabled:cursor-not-allowed">
                        {training.sectionOrder === 'any'
                          ? 'Back to sections'
                          : sectionIdx < training.sections.length - 1 ? 'Next Section' : 'Complete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={submitQuiz}
                    disabled={submittingQuiz || !allAnswered(section.quiz, quizAnswers)}
                    className="w-full py-4 bg-[#FF9500] text-white font-medium rounded-[8px] hover:bg-[#EA8500] disabled:opacity-40"
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

// ─────────────────────────── Quiz answer helpers ───────────────────────────

function isAnswered(q: QuizQuestion, value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false
  if (q.questionType === 'single' || q.questionType === 'multiselect' || q.questionType === 'image') {
    return Array.isArray(value) && value.length > 0
  }
  if (q.questionType === 'text') return typeof value === 'string' && value.trim() !== ''
  if (q.questionType === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (q.questionType === 'file') return typeof value === 'object' && value !== null && 'url' in value
  return false
}

function allAnswered(quiz: Quiz, answers: Record<string, AnswerValue>): boolean {
  return quiz.questions.every((q) => isAnswered(q, answers[q.id]))
}

// ─────────────────────────── Per-question viewer ───────────────────────────

function QuestionCard({
  q,
  index,
  answer,
  result,
  feedbackMode,
  locked,
  slug,
  preview,
  token,
  onAnswer,
}: {
  q: QuizQuestion
  index: number
  answer: AnswerValue | undefined
  result: QuizResult | undefined
  feedbackMode: FeedbackMode
  locked: boolean
  slug: string
  preview: string | null
  token: string | null
  onAnswer: (v: AnswerValue) => void
}) {
  // Result reveal: 'none' shows nothing, 'correctness' shows ✓/✗, 'explanation'
  // also shows hints and the canonical answer for free-form types.
  const showResult = !!result && feedbackMode !== 'none'
  const showExplanation = !!result && feedbackMode === 'explanation'

  return (
    <div className="border border-[#F1F1F3] rounded-[8px] p-5">
      <p className="font-medium text-[#262626] mb-3">{index + 1}. {q.questionText}</p>
      {showResult && (
        <div className={`text-xs font-medium mb-3 ${result!.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
          {result!.isCorrect ? '✓ Correct' : '✗ Wrong'}
        </div>
      )}
      {(q.questionType === 'single' || q.questionType === 'multiselect' || q.questionType === 'image') && Array.isArray(q.options) && (
        <ChoiceQuestionInput
          q={q}
          options={q.options as ChoiceQuizOption[]}
          selected={(Array.isArray(answer) ? answer : []) as number[]}
          result={result}
          showResult={showResult}
          showExplanation={showExplanation}
          locked={locked}
          onChange={onAnswer}
        />
      )}
      {q.questionType === 'text' && (
        <TextQuestionInput
          value={typeof answer === 'string' ? answer : ''}
          locked={locked}
          showResult={showResult}
          showExplanation={showExplanation}
          result={result}
          onChange={onAnswer}
        />
      )}
      {q.questionType === 'number' && (
        <NumberQuestionInput
          value={typeof answer === 'number' ? answer : null}
          locked={locked}
          showResult={showResult}
          showExplanation={showExplanation}
          result={result}
          onChange={onAnswer}
        />
      )}
      {q.questionType === 'file' && (
        <FileQuestionInput
          q={q}
          value={typeof answer === 'object' && answer && 'url' in answer ? answer : null}
          locked={locked}
          slug={slug}
          preview={preview}
          token={token}
          showResult={showResult}
          onChange={onAnswer}
        />
      )}
    </div>
  )
}

function ChoiceQuestionInput({
  q,
  options,
  selected,
  result,
  showResult,
  showExplanation,
  locked,
  onChange,
}: {
  q: QuizQuestion
  options: ChoiceQuizOption[]
  selected: number[]
  result: QuizResult | undefined
  showResult: boolean
  showExplanation: boolean
  locked: boolean
  onChange: (v: number[]) => void
}) {
  const isMulti = q.questionType === 'multiselect'
  const isImage = q.questionType === 'image'

  const toggle = (idx: number) => {
    if (locked) return
    if (isMulti) {
      const next = selected.includes(idx) ? selected.filter((i) => i !== idx) : [...selected, idx]
      onChange(next)
    } else {
      onChange([idx])
    }
  }

  if (isImage) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.index)
          const isRight = showResult && result?.correctIndices?.includes(opt.index)
          let ring = 'border-[#F1F1F3]'
          if (showResult && isSelected && isRight) ring = 'border-green-500 ring-2 ring-green-200'
          else if (showResult && isSelected && !isRight) ring = 'border-red-500 ring-2 ring-red-200'
          else if (showResult && isRight) ring = 'border-green-300'
          else if (isSelected) ring = 'border-[#FF9500] ring-2 ring-[#FFEDD5]'
          return (
            <button
              key={opt.index}
              type="button"
              onClick={() => toggle(opt.index)}
              disabled={locked}
              className={`text-left p-2 rounded-[10px] border-2 ${ring} bg-white hover:bg-[#FFF7ED] disabled:cursor-not-allowed transition-colors`}
            >
              <div className="aspect-video rounded-[6px] bg-[#F7F7F8] overflow-hidden mb-2 flex items-center justify-center">
                {opt.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={opt.imageUrl} alt={opt.text || 'option'} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-[#59595A]">No image</span>
                )}
              </div>
              {opt.text && <div className="text-xs text-[#262626]">{opt.text}</div>}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.index)
        const isRight = showResult && result?.correctIndices?.includes(opt.index)
        let borderColor = '#F1F1F3', bgColor = 'transparent'
        if (showResult && isSelected && isRight) { borderColor = '#22c55e'; bgColor = '#f0fdf4' }
        else if (showResult && isSelected && !isRight) { borderColor = '#ef4444'; bgColor = '#fef2f2' }
        else if (showResult && isRight) { borderColor = '#bbf7d0'; bgColor = '#f0fdf4' }
        else if (isSelected) { borderColor = '#FF9500'; bgColor = '#FFF7ED' }
        const optionHint = showExplanation ? result?.hints?.[opt.index] : null
        return (
          <div key={opt.index}>
            <button
              type="button"
              onClick={() => toggle(opt.index)}
              disabled={locked}
              className="w-full text-left px-4 py-3 rounded-[8px] text-sm transition-colors disabled:cursor-not-allowed"
              style={{ border: `1.5px solid ${borderColor}`, backgroundColor: bgColor }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[#262626]">{opt.text}</span>
                {showResult && isSelected && isRight && <span className="text-green-600 text-xs font-medium">✓ Correct</span>}
                {showResult && isSelected && !isRight && <span className="text-red-600 text-xs font-medium">✗ Wrong</span>}
              </div>
            </button>
            {optionHint && (
              <p className={`text-xs mt-1 ml-4 ${isRight ? 'text-green-600' : 'text-red-600'}`}>{optionHint}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TextQuestionInput({
  value,
  locked,
  showResult,
  showExplanation,
  result,
  onChange,
}: {
  value: string
  locked: boolean
  showResult: boolean
  showExplanation: boolean
  result: QuizResult | undefined
  onChange: (v: string) => void
}) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={locked}
        rows={3}
        placeholder="Type your answer…"
        className="w-full px-3 py-2 border border-[#F1F1F3] rounded-[8px] text-sm focus:outline-none focus:border-[#FF9500] disabled:bg-[#F7F7F8]"
      />
      {showExplanation && result?.correctAnswerText && (
        <p className="text-xs mt-2 text-[#59595A]">
          Correct answer: <span className="font-medium text-[#262626]">{result.correctAnswerText}</span>
        </p>
      )}
      {showExplanation && result?.hints?.[0] && (
        <p className={`text-xs mt-1 ${result.isCorrect ? 'text-green-600' : 'text-red-600'}`}>{result.hints[0]}</p>
      )}
      {showResult && !showExplanation && (
        <p className={`text-xs mt-2 ${result!.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
          {result!.isCorrect ? 'Correct' : 'Not correct'}
        </p>
      )}
    </div>
  )
}

function NumberQuestionInput({
  value,
  locked,
  showResult,
  showExplanation,
  result,
  onChange,
}: {
  value: number | null
  locked: boolean
  showResult: boolean
  showExplanation: boolean
  result: QuizResult | undefined
  onChange: (v: number) => void
}) {
  return (
    <div>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        disabled={locked}
        placeholder="Enter a number"
        className="w-full px-3 py-2 border border-[#F1F1F3] rounded-[8px] text-sm focus:outline-none focus:border-[#FF9500] disabled:bg-[#F7F7F8]"
      />
      {showExplanation && result?.correctAnswerText && (
        <p className="text-xs mt-2 text-[#59595A]">
          Correct answer: <span className="font-medium text-[#262626]">{result.correctAnswerText}</span>
        </p>
      )}
      {showExplanation && result?.hints?.[0] && (
        <p className={`text-xs mt-1 ${result.isCorrect ? 'text-green-600' : 'text-red-600'}`}>{result.hints[0]}</p>
      )}
      {showResult && !showExplanation && (
        <p className={`text-xs mt-2 ${result!.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
          {result!.isCorrect ? 'Correct' : 'Not correct'}
        </p>
      )}
    </div>
  )
}

function FileQuestionInput({
  q,
  value,
  locked,
  slug,
  preview,
  token,
  showResult,
  onChange,
}: {
  q: QuizQuestion
  value: { url: string; mimeType: string; sizeBytes: number } | null
  locked: boolean
  slug: string
  preview: string | null
  token: string | null
  showResult: boolean
  onChange: (v: { url: string; mimeType: string; sizeBytes: number }) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileOpts = q.options as { kind: 'file'; acceptedMimeTypes: string[]; maxSizeMb: number }

  const upload = async (file: File) => {
    setError(null)
    if (fileOpts.acceptedMimeTypes?.length && !fileOpts.acceptedMimeTypes.includes(file.type)) {
      setError(`File type not allowed. Expected: ${fileOpts.acceptedMimeTypes.join(', ')}`)
      return
    }
    if (file.size > fileOpts.maxSizeMb * 1024 * 1024) {
      setError(`File too large (max ${fileOpts.maxSizeMb}MB)`)
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const qs = new URLSearchParams()
      if (token) qs.set('token', token)
      if (preview) qs.set('preview', preview)
      const url = qs.toString()
        ? `/api/public/trainings/${slug}/upload-answer?${qs.toString()}`
        : `/api/public/trainings/${slug}/upload-answer`
      const res = await fetch(url, { method: 'POST', body: fd })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setError(e.error || 'Upload failed')
        return
      }
      const json = await res.json()
      onChange({ url: json.url, mimeType: json.mimeType, sizeBytes: json.sizeBytes })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      {value ? (
        <div className="flex items-center gap-3 p-3 border border-[#F1F1F3] rounded-[8px] bg-[#F7F7F8]">
          <div className="flex-1 min-w-0">
            <a href={value.url} target="_blank" rel="noopener noreferrer" className="text-sm text-[#FF9500] hover:underline truncate block">
              {value.url.split('/').pop() || 'Uploaded file'}
            </a>
            <div className="text-xs text-[#59595A]">
              {value.mimeType} · {(value.sizeBytes / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
          {!locked && (
            <button onClick={() => onChange({ url: '', mimeType: '', sizeBytes: 0 })} className="text-xs text-[#59595A] hover:text-red-600">Replace</button>
          )}
        </div>
      ) : (
        <label className={`block w-full px-4 py-6 border-2 border-dashed rounded-[8px] text-center cursor-pointer transition-colors ${locked ? 'opacity-60 cursor-not-allowed' : 'border-[#E4E4E7] hover:border-[#FF9500] hover:bg-[#FFF7ED]'}`}>
          <input
            type="file"
            className="hidden"
            disabled={locked || uploading}
            accept={fileOpts.acceptedMimeTypes?.join(',') || undefined}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
          />
          <div className="text-sm text-[#262626] font-medium">
            {uploading ? 'Uploading…' : 'Click to upload a file'}
          </div>
          <div className="text-xs text-[#59595A] mt-1">
            {fileOpts.acceptedMimeTypes?.length ? fileOpts.acceptedMimeTypes.join(', ') : 'Any file type'} · max {fileOpts.maxSizeMb}MB
          </div>
        </label>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {showResult && (
        <p className="text-xs mt-2 text-[#59595A]">
          {value ? 'File received — graded automatically.' : 'No file uploaded.'}
        </p>
      )}
    </div>
  )
}
