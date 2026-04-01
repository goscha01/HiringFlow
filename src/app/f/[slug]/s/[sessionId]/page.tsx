'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import VideoRecorder from '@/components/VideoRecorder'
import CaptionedVideo, { type CaptionStyle, DEFAULT_CAPTION_STYLE } from '@/components/CaptionedVideo'

interface StepOption {
  optionId: string
  text: string
  nextStepId: string | null
}

interface Segment {
  start: number
  end: number
  text: string
}

interface FormField {
  id: string
  label: string
  type: string
  enabled: boolean
  required: boolean
  isBuiltIn?: boolean
}

interface StepData {
  stepId: string
  title: string
  videoUrl: string | null
  questionText: string | null
  stepType: string
  infoContent?: string | null
  progress?: { current: number; total: number }
  questionType: string
  captionsEnabled?: boolean
  captionStyle?: CaptionStyle | null
  segments?: Segment[]
  formEnabled?: boolean
  formConfig?: { fields: FormField[] } | null
  options: StepOption[]
  finished?: boolean
}

export default function SessionPlayerPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const sessionId = params.sessionId as string

  const [step, setStep] = useState<StepData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [videoEnded, setVideoEnded] = useState(false)
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [textMessage, setTextMessage] = useState('')
  const [textAnswer, setTextAnswer] = useState('')
  const [recordedVideo, setRecordedVideo] = useState<Blob | null>(null)
  // Form state
  const [showForm, setShowForm] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [formSubmitted, setFormSubmitted] = useState(false)

  useEffect(() => {
    fetchStep()
  }, [sessionId])

  const fetchStep = async () => {
    setLoading(true)
    setVideoEnded(false)
    setSelectedOptions([])
    setTextMessage('')
    setTextAnswer('')
    setRecordedVideo(null)
    setFormSubmitted(false)
    setFormValues({})
    const res = await fetch(`/api/public/sessions/${sessionId}/step`)
    if (res.ok) {
      const data = await res.json()
      if (data.finished) {
        router.push(`/f/${slug}/s/${sessionId}/done`)
      } else {
        setStep(data)
        // Show form for form steps or if form is enabled on other steps
        if ((data.stepType === 'form' || data.formEnabled) && data.formConfig?.fields?.some((f: FormField) => f.enabled)) {
          setShowForm(true)
        } else {
          setShowForm(false)
        }
      }
    }
    setLoading(false)
  }

  const handleVideoEnd = () => {
    setVideoEnded(true)
  }

  const handleFormSubmit = () => {
    // Validate required fields
    const enabledFields = step?.formConfig?.fields?.filter(f => f.enabled) || []
    const missingRequired = enabledFields.filter(f => f.required && !formValues[f.id]?.trim())
    if (missingRequired.length > 0) return

    setFormSubmitted(true)
    setShowForm(false)
  }

  const selectOption = async (option: StepOption) => {
    if (!step) return
    setSubmitting(true)
    const res = await fetch(`/api/public/sessions/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stepId: step.stepId,
        optionId: option.optionId,
        formData: formSubmitted ? formValues : undefined,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.finished) {
        router.push(`/f/${slug}/s/${sessionId}/done`)
      } else {
        fetchStep()
      }
    }
    setSubmitting(false)
  }

  const toggleOption = (optionId: string) => {
    setSelectedOptions((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
    )
  }

  const submitMultiselect = async () => {
    if (!step || selectedOptions.length === 0) return
    setSubmitting(true)
    const res = await fetch(`/api/public/sessions/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stepId: step.stepId,
        optionIds: selectedOptions,
        formData: formSubmitted ? formValues : undefined,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.finished) {
        router.push(`/f/${slug}/s/${sessionId}/done`)
      } else {
        fetchStep()
      }
    }
    setSubmitting(false)
  }

  const submitSubmission = async () => {
    if (!step || (!textMessage && !recordedVideo)) return
    setSubmitting(true)
    const formData = new FormData()
    formData.append('stepId', step.stepId)
    if (textMessage) formData.append('textMessage', textMessage)
    if (recordedVideo) formData.append('video', recordedVideo, 'recording.webm')
    if (formSubmitted) formData.append('formData', JSON.stringify(formValues))

    const res = await fetch(`/api/public/sessions/${sessionId}/submit`, {
      method: 'POST',
      body: formData,
    })
    if (res.ok) {
      router.push(`/f/${slug}/s/${sessionId}/done`)
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (!step) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-center">
          <h1 className="text-xl font-semibold mb-2">Session Not Found</h1>
          <p className="text-gray-400">This session may have expired.</p>
        </div>
      </div>
    )
  }

  // Form screen — shown before video
  if (showForm && !formSubmitted) {
    const enabledFields = step.formConfig?.fields?.filter(f => f.enabled) || []
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{step.title}</h2>
          <p className="text-sm text-gray-500 mb-6">Please fill in the following before we begin</p>

          <div className="space-y-4">
            {enabledFields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={formValues[field.id] || ''}
                    onChange={(e) => setFormValues({ ...formValues, [field.id]: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder={field.label}
                  />
                ) : (
                  <input
                    type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                    value={formValues[field.id] || ''}
                    onChange={(e) => setFormValues({ ...formValues, [field.id]: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder={field.label}
                  />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleFormSubmit}
            className="w-full mt-6 py-3 bg-brand-500 text-white rounded-xl font-medium hover:bg-brand-600 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  const showOptions = !step.videoUrl || videoEnded

  // Question/options rendering (shared between mobile overlay and desktop sidebar)
  const renderQuestionContent = (overlay = false) => {
    const containerClass = overlay
      ? 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-6 pt-16'
      : ''
    const textColorClass = overlay ? 'text-white' : 'text-gray-900'
    const optionBorderClass = overlay
      ? 'border-white/30 hover:border-white/60 hover:bg-white/10 text-white'
      : 'border-gray-200 hover:border-brand-500 hover:bg-brand-50 text-gray-900'
    const optionSelectedClass = overlay
      ? 'border-brand-400 bg-brand-500/30 text-white'
      : 'border-brand-500 bg-brand-50 text-gray-900'
    const disabledClass = overlay
      ? 'border-white/10 bg-white/5 text-white/40 cursor-not-allowed'
      : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'

    return (
      <div className={containerClass}>
        {step.questionText && (
          <h2 className={`text-lg font-semibold ${textColorClass} ${overlay ? 'text-left' : 'text-center'} mb-4`}>
            {step.questionText}
          </h2>
        )}

        {(step.stepType || 'question') === 'question' && (
          <div className={overlay ? '' : 'max-w-md mx-auto'}>
            {/* Single/Button */}
            {((step.questionType || 'single') === 'single' || step.questionType === 'button') && (
              <div className="space-y-2.5">
                {step.options.map((option) => (
                  <button
                    key={option.optionId}
                    onClick={() => selectOption(option)}
                    disabled={submitting || (!showOptions && step.videoUrl !== null)}
                    className={`w-full py-3 px-5 rounded-xl border-2 transition-all ${
                      step.questionType === 'button' ? 'text-center' : 'text-left'
                    } ${
                      showOptions || !step.videoUrl ? optionBorderClass : disabledClass
                    } ${submitting ? 'opacity-50' : ''}`}
                  >
                    <span className="font-medium text-sm">{option.text}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Multiselect */}
            {step.questionType === 'multiselect' && (
              <>
                <div className="space-y-2.5 mb-4">
                  {step.options.map((option) => (
                    <label
                      key={option.optionId}
                      className={`flex items-center w-full py-3 px-5 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedOptions.includes(option.optionId)
                          ? optionSelectedClass
                          : optionBorderClass
                      } ${!showOptions && step.videoUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedOptions.includes(option.optionId)}
                        onChange={() => toggleOption(option.optionId)}
                        disabled={!showOptions && !!step.videoUrl}
                        className="mr-3 h-4 w-4 text-brand-500 rounded"
                      />
                      <span className="font-medium text-sm">{option.text}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={submitMultiselect}
                  disabled={selectedOptions.length === 0 || submitting || (!showOptions && !!step.videoUrl)}
                  className="w-full py-3 bg-brand-500 text-white rounded-xl font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-600 transition-colors"
                >
                  {submitting ? 'Submitting...' : `Continue (${selectedOptions.length} selected)`}
                </button>
              </>
            )}
          </div>
        )}

        {/* Submission */}
        {step.stepType === 'submission' && (
          <div className={`space-y-4 ${overlay ? '' : 'max-w-md mx-auto'}`}>
            <div>
              <label className={`block text-sm font-medium ${overlay ? 'text-white/80' : 'text-gray-700'} mb-2`}>
                Record a video response (optional)
              </label>
              <VideoRecorder onRecordComplete={(blob) => setRecordedVideo(blob)} recordedVideo={recordedVideo} />
            </div>
            <div>
              <label className={`block text-sm font-medium ${overlay ? 'text-white/80' : 'text-gray-700'} mb-2`}>
                Or write a message
              </label>
              <textarea
                value={textMessage}
                onChange={(e) => setTextMessage(e.target.value)}
                rows={3}
                placeholder="Type your response here..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={submitSubmission}
              disabled={(!textMessage && !recordedVideo) || submitting}
              className="w-full py-3 bg-brand-500 text-white rounded-xl font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-600 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Response'}
            </button>
          </div>
        )}

        {/* Info Step */}
        {step.stepType === 'info' && (
          <div className={overlay ? '' : 'max-w-md mx-auto'}>
            {step.infoContent && (
              <p className={`text-sm ${textColorClass} mb-4 whitespace-pre-wrap`}>{step.infoContent}</p>
            )}
            <button
              onClick={async () => {
                setSubmitting(true)
                const res = await fetch(`/api/public/sessions/${sessionId}/answer`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ stepId: step.stepId }),
                })
                if (res.ok) {
                  const data = await res.json()
                  if (data.finished) router.push(`/f/${slug}/s/${sessionId}/done`)
                  else fetchStep()
                }
                setSubmitting(false)
              }}
              disabled={submitting}
              className="w-full py-3 bg-brand-500 text-white rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-brand-600 transition-colors"
            >
              {submitting ? 'Loading...' : 'Continue'}
            </button>
          </div>
        )}

        {/* Text Answer Question */}
        {(step.stepType || 'question') === 'question' && step.questionType === 'text' && (
          <div className={overlay ? '' : 'max-w-md mx-auto'}>
            <textarea
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              rows={4}
              placeholder="Type your answer..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 mb-3"
            />
            <button
              onClick={async () => {
                if (!textAnswer.trim()) return
                setSubmitting(true)
                const res = await fetch(`/api/public/sessions/${sessionId}/answer`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ stepId: step.stepId, textAnswer }),
                })
                if (res.ok) {
                  const data = await res.json()
                  if (data.finished) router.push(`/f/${slug}/s/${sessionId}/done`)
                  else fetchStep()
                }
                setSubmitting(false)
              }}
              disabled={!textAnswer.trim() || submitting}
              className="w-full py-3 bg-brand-500 text-white rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-brand-600 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Answer'}
            </button>
          </div>
        )}

        {!showOptions && step.videoUrl && (step.stepType || 'question') === 'question' && step.questionType !== 'text' && (
          <p className={`text-center text-sm ${overlay ? 'text-white/50' : 'text-gray-500'} mt-3`}>
            Watch the video to unlock options
          </p>
        )}

        {/* Progress bar */}
        {step.progress && (
          <div className="mt-4">
            <div className="flex gap-1">
              {Array.from({ length: step.progress.total }).map((_, i) => (
                <div key={i} className={`flex-1 h-1 rounded-full ${i < step.progress!.current ? 'bg-brand-500' : 'bg-gray-200'}`} />
              ))}
            </div>
            <p className={`text-center text-xs mt-1 ${overlay ? 'text-white/40' : 'text-gray-400'}`}>
              Step {step.progress.current} of {step.progress.total}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Desktop: side-by-side */}
      <div className="hidden lg:flex h-screen">
        {/* Left: Video — fill screen height */}
        <div className="flex-1 flex items-center justify-center p-4">
          {step.videoUrl ? (
            <div className="w-full h-full flex items-center justify-center">
              <CaptionedVideo
                src={step.videoUrl}
                segments={step.segments || []}
                captionsEnabled={step.captionsEnabled || false}
                captionStyle={(step.captionStyle as CaptionStyle) || DEFAULT_CAPTION_STYLE}
                autoPlay
                onEnded={handleVideoEnd}
                className="rounded-lg shadow-2xl max-h-[calc(100vh-2rem)] w-auto"
              />
            </div>
          ) : (
            <div className="text-white text-center">
              <h2 className="text-2xl font-semibold">{step.title}</h2>
            </div>
          )}
        </div>

        {/* Right: Questions */}
        <div className="w-[400px] bg-white flex flex-col justify-center p-8 overflow-y-auto">
          {step.title && (
            <h3 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wide">{step.title}</h3>
          )}
          {renderQuestionContent(false)}
        </div>
      </div>

      {/* Mobile: video with overlay questions */}
      <div className="lg:hidden flex flex-col min-h-screen">
        <div className="flex-1 relative flex items-center justify-center">
          {step.videoUrl ? (
            <div className="w-full h-full">
              <CaptionedVideo
                src={step.videoUrl}
                segments={step.segments || []}
                captionsEnabled={step.captionsEnabled || false}
                captionStyle={(step.captionStyle as CaptionStyle) || DEFAULT_CAPTION_STYLE}
                autoPlay
                onEnded={handleVideoEnd}
                className="w-full h-full object-cover"
              />
              {/* Overlay questions on mobile */}
              {renderQuestionContent(true)}
            </div>
          ) : (
            <div className="text-white text-center p-6">
              <h2 className="text-2xl font-semibold mb-6">{step.title}</h2>
              <div className="bg-white rounded-2xl p-6">
                {renderQuestionContent(false)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
