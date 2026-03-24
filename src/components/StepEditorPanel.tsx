'use client'

import { useState, useRef } from 'react'
import { uploadVideoFile } from '@/lib/upload-client'

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

interface StepEditorPanelProps {
  step: Step
  allSteps: Step[]
  videos: Video[]
  onUpdateStep: (stepId: string, data: Partial<Step>) => void
  onDeleteStep: (stepId: string) => void
  onAddOption: (stepId: string) => void
  onUpdateOption: (optionId: string, data: { optionText?: string; nextStepId?: string | null }) => void
  onDeleteOption: (stepId: string, optionId: string) => void
  onVideoUploaded?: (video: Video) => void
}

export default function StepEditorPanel({
  step,
  allSteps,
  videos,
  onUpdateStep,
  onDeleteStep,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
  onVideoUploaded,
}: StepEditorPanelProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState<{ text: string; segments: Array<{ start: number; end: number; text: string }> } | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<{ question: string; options: Array<{ text: string; isEndFlow: boolean }> } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      alert('Please select a video file')
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      const result = await uploadVideoFile(file, (progress) => {
        setUploadProgress(progress)
      })

      // Refresh videos list to get DB record with ID
      const res = await fetch('/api/videos')
      if (res.ok) {
        const allVideos = await res.json()
        const uploaded = allVideos.find((v: Video) => v.url === result.url)
        if (uploaded) {
          onVideoUploaded?.(uploaded)
          onUpdateStep(step.id, { videoId: uploaded.id })
        }
      }
    } catch {
      // Upload failed silently
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleTranscribe = async () => {
    if (!step.videoId) return
    setTranscribing(true)
    try {
      const res = await fetch(`/api/videos/${step.videoId}/transcribe`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setTranscript(data)
      }
    } catch {}
    setTranscribing(false)
  }

  const handleSuggestQuestions = async () => {
    setSuggesting(true)
    setSuggestion(null)
    try {
      const res = await fetch('/api/ai/suggest-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript?.text || null,
          stepTitle: step.title,
          flowContext: `This is step ${step.stepOrder + 1} in a video interview flow.`,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSuggestion(data)
      }
    } catch {}
    setSuggesting(false)
  }

  const applySuggestion = () => {
    if (!suggestion) return
    onUpdateStep(step.id, { questionText: suggestion.question })
    setSuggestion(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Edit Step</h2>
        <button
          onClick={() => onDeleteStep(step.id)}
          className="text-red-600 hover:text-red-800 text-sm"
        >
          Delete Step
        </button>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          type="text"
          value={step.title}
          onChange={(e) => onUpdateStep(step.id, { title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Video Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Video</label>
        <div className="flex gap-2">
          <select
            value={step.videoId || ''}
            onChange={(e) => onUpdateStep(step.id, { videoId: e.target.value || null })}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">No video selected</option>
            {videos.map((video) => (
              <option key={video.id} value={video.id}>
                {video.filename}
              </option>
            ))}
          </select>
          <label className={`px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors whitespace-nowrap ${
            uploading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
          }`}>
            {uploading ? `${uploadProgress}%` : 'Upload'}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {/* Upload progress bar */}
        {uploading && (
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Uploading video...</p>
          </div>
        )}

        {step.video && (
          <div className="mt-2">
            <video
              src={step.video.url}
              className="w-full max-w-md rounded-md"
              controls
              preload="metadata"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleTranscribe}
                disabled={transcribing}
                className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-md hover:bg-purple-100 disabled:opacity-50 transition-colors"
              >
                {transcribing ? 'Transcribing...' : transcript ? 'Re-transcribe' : 'Generate Captions'}
              </button>
              <button
                onClick={handleSuggestQuestions}
                disabled={suggesting}
                className="px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50 transition-colors"
              >
                {suggesting ? 'Thinking...' : 'Suggest Question'}
              </button>
            </div>
          </div>
        )}

        {/* Transcript / Captions */}
        {transcript && (
          <div className="mt-3 bg-gray-50 rounded-md p-3 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase">Captions</span>
              <button
                onClick={() => setTranscript(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Dismiss
              </button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
              {transcript.segments.length > 0 ? (
                transcript.segments.map((seg, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-gray-400 text-xs font-mono whitespace-nowrap mt-0.5">
                      {formatTime(seg.start)}
                    </span>
                    <span className="text-gray-700">{seg.text}</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-600">{transcript.text}</p>
              )}
            </div>
          </div>
        )}

        {/* AI Suggestion */}
        {suggestion && (
          <div className="mt-3 bg-amber-50 rounded-md p-3 border border-amber-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-amber-600 uppercase">AI Suggestion</span>
              <button
                onClick={() => setSuggestion(null)}
                className="text-xs text-amber-400 hover:text-amber-600"
              >
                Dismiss
              </button>
            </div>
            <p className="text-sm font-medium text-gray-800 mb-2">&ldquo;{suggestion.question}&rdquo;</p>
            <div className="space-y-1 mb-3">
              {suggestion.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center text-[10px]">{i + 1}</span>
                  {opt.text}
                  {opt.isEndFlow && <span className="text-[10px] text-red-500 font-medium">(End)</span>}
                </div>
              ))}
            </div>
            <button
              onClick={applySuggestion}
              className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors"
            >
              Apply Question
            </button>
          </div>
        )}
      </div>

      {/* Question */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">Question</label>
          {!step.video && (
            <button
              onClick={handleSuggestQuestions}
              disabled={suggesting}
              className="text-xs text-amber-600 hover:text-amber-800 disabled:opacity-50"
            >
              {suggesting ? 'Thinking...' : 'AI Suggest'}
            </button>
          )}
        </div>
        <textarea
          value={step.questionText || ''}
          onChange={(e) => onUpdateStep(step.id, { questionText: e.target.value })}
          rows={2}
          placeholder="What question should candidates answer?"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Step Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Step Type</label>
        <select
          value={step.stepType || 'question'}
          onChange={(e) =>
            onUpdateStep(step.id, { stepType: e.target.value as 'question' | 'submission' })
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="question">Question (Select Options)</option>
          <option value="submission">Submission (Video/Text Response)</option>
        </select>
      </div>

      {/* Question Type */}
      {(step.stepType || 'question') === 'question' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Question Type</label>
          <select
            value={step.questionType || 'single'}
            onChange={(e) =>
              onUpdateStep(step.id, {
                questionType: e.target.value as 'single' | 'multiselect' | 'button',
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="single">Single Choice (Radio)</option>
            <option value="multiselect">Multiple Choice (Checkbox)</option>
            <option value="button">Quick Action (Buttons)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {(step.questionType || 'single') === 'single' && 'Candidate can select one option'}
            {step.questionType === 'multiselect' &&
              'Candidate can select multiple options, then click Continue'}
            {step.questionType === 'button' && 'Options appear as action buttons'}
          </p>
        </div>
      )}

      {/* Submission Step Info */}
      {step.stepType === 'submission' && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h4 className="font-medium text-blue-800 mb-2">Submission Step</h4>
          <p className="text-sm text-blue-700">
            Candidates will be able to record a video and/or submit a text message in response to
            your question. This step will end the flow.
          </p>
        </div>
      )}

      {/* Options */}
      {(step.stepType || 'question') === 'question' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Answer Options</label>
            <button
              onClick={() => onAddOption(step.id)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              + Add Option
            </button>
          </div>
          <div className="space-y-3">
            {step.options.map((option) => (
              <div key={option.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-md">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={option.optionText}
                    onChange={(e) => onUpdateOption(option.id, { optionText: e.target.value })}
                    placeholder="Option text"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <select
                    value={option.nextStepId || ''}
                    onChange={(e) =>
                      onUpdateOption(option.id, { nextStepId: e.target.value || null })
                    }
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">End Flow</option>
                    {allSteps
                      .filter((s) => s.id !== step.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          Go to: {s.title}
                        </option>
                      ))}
                  </select>
                </div>
                <button
                  onClick={() => onDeleteOption(step.id, option.id)}
                  className="text-red-500 hover:text-red-700 p-1"
                >
                  &times;
                </button>
              </div>
            ))}
            {step.options.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-4">
                No options yet. Add options for candidates to choose from.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
