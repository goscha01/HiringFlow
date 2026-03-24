'use client'

import { useRef, useState } from 'react'

interface Video {
  id: string
  filename: string
  url: string
}

interface Option {
  id: string
  optionText: string
  nextStepId: string | null
}

interface Step {
  id: string
  title: string
  videoId: string | null
  video: Video | null
  questionText: string | null
  stepOrder: number
  stepType: 'question' | 'submission'
  questionType: 'single' | 'multiselect' | 'button'
  options: Option[]
}

interface StepPreviewModalProps {
  previewId: string
  step: Step | null
  allSteps: Step[]
  flowName: string
  startMessage: string
  endMessage: string
  onClose: () => void
  onNavigate: (stepId: string) => void
}

export default function StepPreviewModal({
  previewId,
  step,
  allSteps,
  flowName,
  startMessage,
  endMessage,
  onClose,
  onNavigate,
}: StepPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoEnded, setVideoEnded] = useState(false)
  const [candidateName, setCandidateName] = useState('')

  const sorted = [...allSteps].sort((a, b) => a.stepOrder - b.stepOrder)
  const firstStepId = sorted[0]?.id

  // --- Start Screen ---
  if (previewId === '__start__') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg">
          {/* Preview badge */}
          <div className="flex justify-center mb-3">
            <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full tracking-wide">
              PREVIEW &middot; START SCREEN
            </span>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl p-1">
            <div className="bg-white rounded-xl p-8 text-center">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>

              <h1 className="text-2xl font-bold text-gray-900 mb-2">{flowName}</h1>
              <p className="text-gray-600 mb-6">{startMessage}</p>

              <input
                type="text"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl mb-4 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <button
                onClick={() => {
                  if (firstStepId) {
                    setVideoEnded(false)
                    onNavigate(firstStepId)
                  }
                }}
                disabled={!firstStepId}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Start
              </button>

              <p className="text-xs text-gray-400 mt-3">Your responses will be recorded</p>
            </div>
          </div>

          <div className="flex justify-center mt-3">
            <button onClick={onClose} className="text-white/70 hover:text-white text-sm">
              Close preview
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- End Screen ---
  if (previewId === '__end__') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg">
          <div className="flex justify-center mb-3">
            <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full tracking-wide">
              PREVIEW &middot; END SCREEN
            </span>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-1">
            <div className="bg-white rounded-xl p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h1 className="text-2xl font-bold text-gray-900 mb-3">All Done!</h1>
              <p className="text-gray-600 mb-4">{endMessage}</p>
              <p className="text-sm text-gray-500">You can close this window now.</p>
            </div>
          </div>

          <div className="flex justify-center mt-3">
            <button onClick={onClose} className="text-white/70 hover:text-white text-sm">
              Close preview
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Regular Step ---
  if (!step) return null

  const showOptions = !step.video || videoEnded

  const handleOptionClick = (option: Option) => {
    if (option.nextStepId) {
      setVideoEnded(false)
      onNavigate(option.nextStepId)
    } else {
      onNavigate('__end__')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">
              PREVIEW
            </span>
            <span className="text-white font-medium text-sm truncate">{step.title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-2"
          >
            &times;
          </button>
        </div>

        {/* Video */}
        {step.video ? (
          <div className="relative bg-black">
            <video
              ref={videoRef}
              key={step.id}
              src={step.video.url}
              className="w-full max-h-[45vh] object-contain"
              controls
              autoPlay
              onEnded={() => setVideoEnded(true)}
            />
            {!videoEnded && (
              <button
                onClick={() => setVideoEnded(true)}
                className="absolute bottom-3 right-3 bg-white/20 backdrop-blur text-white text-xs px-3 py-1.5 rounded-lg hover:bg-white/30"
              >
                Skip video
              </button>
            )}
          </div>
        ) : (
          <div className="bg-gray-800 px-6 py-8 text-center">
            <h2 className="text-lg font-semibold text-white">{step.title}</h2>
          </div>
        )}

        {/* Question & Options */}
        <div className="p-5 overflow-y-auto">
          {step.questionText && (
            <h3 className="text-white font-medium text-center mb-4">{step.questionText}</h3>
          )}

          {step.stepType === 'submission' ? (
            <div className="text-center text-gray-400 text-sm py-4">
              <p className="mb-3">Candidate would record a video or type a response here.</p>
              <button
                onClick={() => onNavigate('__end__')}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Simulate Submit &rarr; End
              </button>
            </div>
          ) : (
            <div className={`space-y-2 max-w-xl mx-auto ${!showOptions ? 'opacity-40 pointer-events-none' : ''}`}>
              {step.options.map((option) => {
                const targetStep = option.nextStepId
                  ? allSteps.find((s) => s.id === option.nextStepId)
                  : null
                return (
                  <button
                    key={option.id}
                    onClick={() => handleOptionClick(option)}
                    disabled={!showOptions}
                    className="w-full text-left px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl hover:border-blue-500 hover:bg-gray-750 transition-all group"
                  >
                    <span className="text-white font-medium text-sm">{option.optionText}</span>
                    <span className="block text-xs text-gray-500 mt-0.5 group-hover:text-blue-400">
                      {targetStep ? `\u2192 ${targetStep.title}` : '\u2192 End'}
                    </span>
                  </button>
                )
              })}
              {step.options.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-sm mb-3">No options configured</p>
                  <button
                    onClick={() => onNavigate('__end__')}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-sm"
                  >
                    Go to End Screen &rarr;
                  </button>
                </div>
              )}
            </div>
          )}

          {!showOptions && step.video && (
            <p className="text-center text-xs text-gray-500 mt-3">
              Watch or skip the video to see options
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
