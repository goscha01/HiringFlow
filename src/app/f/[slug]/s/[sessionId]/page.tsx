'use client'

import { useState, useEffect, useRef } from 'react'
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

interface StepData {
  stepId: string
  title: string
  videoUrl: string | null
  questionText: string | null
  stepType: 'question' | 'submission'
  questionType: 'single' | 'multiselect' | 'button'
  captionsEnabled?: boolean
  captionStyle?: CaptionStyle | null
  segments?: Segment[]
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
  const [recordedVideo, setRecordedVideo] = useState<Blob | null>(null)


  useEffect(() => {
    fetchStep()
  }, [sessionId])

  const fetchStep = async () => {
    setLoading(true)
    setVideoEnded(false)
    setSelectedOptions([])
    setTextMessage('')
    setRecordedVideo(null)
    const res = await fetch(`/api/public/sessions/${sessionId}/step`)
    if (res.ok) {
      const data = await res.json()
      if (data.finished) {
        router.push(`/f/${slug}/s/${sessionId}/done`)
      } else {
        setStep(data)
      }
    }
    setLoading(false)
  }

  const handleVideoEnd = () => {
    setVideoEnded(true)
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
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
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

  const showOptions = !step.videoUrl || videoEnded

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Video Section */}
      <div className="flex-1 flex items-center justify-center p-4">
        {step.videoUrl ? (
          <div className="w-full max-w-2xl">
            <CaptionedVideo
              src={step.videoUrl}
              segments={step.segments || []}
              captionsEnabled={step.captionsEnabled || false}
              captionStyle={(step.captionStyle as CaptionStyle) || DEFAULT_CAPTION_STYLE}
              autoPlay
              onEnded={handleVideoEnd}
              className="rounded-lg shadow-2xl"
            />
          </div>
        ) : (
          <div className="text-white text-center">
            <h2 className="text-2xl font-semibold mb-4">{step.title}</h2>
          </div>
        )}
      </div>

      {/* Question & Options Section */}
      <div className="bg-white rounded-t-3xl p-6 pb-8 shadow-lg">
        {step.questionText && (
          <h2 className="text-lg font-semibold text-gray-900 text-center mb-6">
            {step.questionText}
          </h2>
        )}

        {/* Question Step - Options */}
        {(step.stepType || 'question') === 'question' && (
          <div className="max-w-md mx-auto">
            {/* Single/Button: Click to submit immediately */}
            {((step.questionType || 'single') === 'single' || step.questionType === 'button') && (
              <div className="space-y-3">
                {step.options.map((option) => (
                  <button
                    key={option.optionId}
                    onClick={() => selectOption(option)}
                    disabled={submitting || (!showOptions && step.videoUrl !== null)}
                    className={`w-full py-4 px-6 rounded-xl border-2 transition-all ${
                      step.questionType === 'button' ? 'text-center' : 'text-left'
                    } ${
                      showOptions || !step.videoUrl
                        ? 'border-gray-200 hover:border-blue-500 hover:bg-blue-50 cursor-pointer'
                        : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                    } ${submitting ? 'opacity-50' : ''}`}
                  >
                    <span className="font-medium">{option.text}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Multiselect: Checkboxes with Continue */}
            {step.questionType === 'multiselect' && (
              <>
                <div className="space-y-3 mb-4">
                  {step.options.map((option) => (
                    <label
                      key={option.optionId}
                      className={`flex items-center w-full py-4 px-6 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedOptions.includes(option.optionId)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      } ${!showOptions && step.videoUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedOptions.includes(option.optionId)}
                        onChange={() => toggleOption(option.optionId)}
                        disabled={!showOptions && !!step.videoUrl}
                        className="mr-3 h-5 w-5 text-blue-600 rounded"
                      />
                      <span className="font-medium">{option.text}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={submitMultiselect}
                  disabled={selectedOptions.length === 0 || submitting || (!showOptions && !!step.videoUrl)}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                >
                  {submitting ? 'Submitting...' : `Continue (${selectedOptions.length} selected)`}
                </button>
              </>
            )}
          </div>
        )}

        {/* Submission Step - Video/Text Input */}
        {step.stepType === 'submission' && (
          <div className="max-w-md mx-auto space-y-6">
            {/* Video Recording Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Record a video response (optional)
              </label>
              <VideoRecorder
                onRecordComplete={(blob) => setRecordedVideo(blob)}
                recordedVideo={recordedVideo}
              />
            </div>

            {/* Text Message Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or write a message
              </label>
              <textarea
                value={textMessage}
                onChange={(e) => setTextMessage(e.target.value)}
                rows={4}
                placeholder="Type your response here..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={submitSubmission}
              disabled={(!textMessage && !recordedVideo) || submitting}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Response'}
            </button>
          </div>
        )}

        {!showOptions && step.videoUrl && (step.stepType || 'question') === 'question' && (
          <p className="text-center text-sm text-gray-500 mt-4">
            Watch the video to unlock the options
          </p>
        )}
      </div>
    </div>
  )
}
