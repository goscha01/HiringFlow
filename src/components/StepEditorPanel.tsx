'use client'

import { useState, useRef } from 'react'
import { uploadVideoFile, triggerVideoAnalysis } from '@/lib/upload-client'

interface Video {
  id: string
  filename: string
  url: string
  displayName?: string | null
  summary?: string | null
  bulletPoints?: string[]
  transcript?: string | null
}

interface Option {
  id: string
  optionText: string
  nextStepId: string | null
}

interface FormField {
  id: string
  label: string
  type: 'text' | 'email' | 'phone' | 'textarea'
  required: boolean
  enabled: boolean
  isBuiltIn?: boolean
}

interface FormConfig {
  fields: FormField[]
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
  formEnabled?: boolean
  formConfig?: FormConfig | null
  options: Option[]
}

const DEFAULT_FORM_CONFIG: FormConfig = {
  fields: [
    { id: 'name', label: 'Full Name', type: 'text', required: true, enabled: true, isBuiltIn: true },
    { id: 'email', label: 'Email', type: 'email', required: true, enabled: true, isBuiltIn: true },
    { id: 'phone', label: 'Phone', type: 'phone', required: false, enabled: false, isBuiltIn: true },
  ],
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
  const [activeTab, setActiveTab] = useState<'quiz' | 'form'>('quiz')
  const [analyzing, setAnalyzing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formConfig: FormConfig = (step.formConfig as FormConfig) || DEFAULT_FORM_CONFIG

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

      if (result.id) {
        const video = { id: result.id, filename: result.filename, url: result.url }
        onVideoUploaded?.(video)
        onUpdateStep(step.id, { videoId: result.id })

        // Auto-trigger analysis (transcription + AI summary) in background
        setAnalyzing(true)
        triggerVideoAnalysis(result.id, (analysis) => {
          setAnalyzing(false)
          setTranscript({ text: analysis.transcript, segments: analysis.segments || [] })
          // Update the video with analysis data
          onVideoUploaded?.({
            ...video,
            displayName: analysis.displayName,
            summary: analysis.summary,
            bulletPoints: analysis.bulletPoints,
            transcript: analysis.transcript,
          })
        })
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
          transcript: transcript?.text || step.video?.transcript || null,
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

  const toggleFormEnabled = () => {
    const newEnabled = !step.formEnabled
    onUpdateStep(step.id, {
      formEnabled: newEnabled,
      formConfig: newEnabled && !step.formConfig ? DEFAULT_FORM_CONFIG : step.formConfig,
    } as Partial<Step>)
  }

  const updateFormField = (fieldId: string, updates: Partial<FormField>) => {
    const newFields = formConfig.fields.map((f) =>
      f.id === fieldId ? { ...f, ...updates } : f
    )
    onUpdateStep(step.id, { formConfig: { fields: newFields } } as Partial<Step>)
  }

  const addCustomField = () => {
    const newField: FormField = {
      id: `custom_${Date.now()}`,
      label: 'New Field',
      type: 'text',
      required: false,
      enabled: true,
      isBuiltIn: false,
    }
    const newFields = [...formConfig.fields, newField]
    onUpdateStep(step.id, { formConfig: { fields: newFields } } as Partial<Step>)
  }

  const removeCustomField = (fieldId: string) => {
    const newFields = formConfig.fields.filter((f) => f.id !== fieldId)
    onUpdateStep(step.id, { formConfig: { fields: newFields } } as Partial<Step>)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
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

      {/* Desktop: side-by-side | Mobile: stacked */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Video */}
        <div className="lg:w-1/2">
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
                className="w-full rounded-md"
                controls
                preload="metadata"
              />

              {/* Analyzing indicator */}
              {analyzing && (
                <div className="mt-2 flex items-center gap-2 text-sm text-purple-600">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing video — transcribing &amp; generating summary...
                </div>
              )}

              {/* Video analysis info */}
              {step.video.displayName && (
                <div className="mt-2 bg-blue-50 rounded-md p-3 border border-blue-200">
                  <p className="text-sm font-medium text-blue-900">{step.video.displayName}</p>
                  {step.video.summary && (
                    <p className="text-xs text-blue-700 mt-1">{step.video.summary}</p>
                  )}
                  {step.video.bulletPoints && step.video.bulletPoints.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {step.video.bulletPoints.map((bp, i) => (
                        <li key={i} className="text-xs text-blue-600 flex items-start gap-1.5">
                          <span className="mt-1 w-1 h-1 bg-blue-400 rounded-full flex-shrink-0" />
                          {bp}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={handleTranscribe}
                  disabled={transcribing || analyzing}
                  className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-md hover:bg-purple-100 disabled:opacity-50 transition-colors"
                >
                  {transcribing ? 'Transcribing...' : transcript ? 'Re-transcribe' : 'Generate Captions'}
                </button>
                {!step.video.displayName && !analyzing && (
                  <button
                    onClick={() => {
                      if (!step.videoId) return
                      setAnalyzing(true)
                      triggerVideoAnalysis(step.videoId, (analysis) => {
                        setAnalyzing(false)
                        setTranscript({ text: analysis.transcript, segments: analysis.segments || [] })
                        onVideoUploaded?.({
                          id: step.video!.id,
                          filename: step.video!.filename,
                          url: step.video!.url,
                          displayName: analysis.displayName,
                          summary: analysis.summary,
                          bulletPoints: analysis.bulletPoints,
                          transcript: analysis.transcript,
                        })
                      })
                    }}
                    className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    Analyze Video
                  </button>
                )}
                <button
                  onClick={handleSuggestQuestions}
                  disabled={suggesting || analyzing}
                  className="px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50 transition-colors"
                >
                  {suggesting ? 'Thinking...' : 'Suggest Question'}
                </button>
              </div>
            </div>
          )}

          {/* Transcript */}
          {transcript && (
            <div className="mt-3 bg-gray-50 rounded-md p-3 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 uppercase">Captions</span>
                <button onClick={() => setTranscript(null)} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                {transcript.segments.length > 0 ? (
                  transcript.segments.map((seg, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-gray-400 text-xs font-mono whitespace-nowrap mt-0.5">{formatTime(seg.start)}</span>
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
                <button onClick={() => setSuggestion(null)} className="text-xs text-amber-400 hover:text-amber-600">Dismiss</button>
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
              <button onClick={applySuggestion} className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors">
                Apply Question
              </button>
            </div>
          )}
        </div>

        {/* Right: Metadata (Quiz / Form tabs) */}
        <div className="lg:w-1/2">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-4">
            <button
              onClick={() => setActiveTab('quiz')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'quiz'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Quiz
            </button>
            <button
              onClick={() => setActiveTab('form')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'form'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Form
              {step.formEnabled && (
                <span className="ml-1.5 w-2 h-2 bg-green-500 rounded-full inline-block" />
              )}
            </button>
          </div>

          {/* Quiz Tab */}
          {activeTab === 'quiz' && (
            <div className="space-y-4">
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
                  onChange={(e) => onUpdateStep(step.id, { stepType: e.target.value as 'question' | 'submission' })}
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
                    onChange={(e) => onUpdateStep(step.id, { questionType: e.target.value as 'single' | 'multiselect' | 'button' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="single">Single Choice (Radio)</option>
                    <option value="multiselect">Multiple Choice (Checkbox)</option>
                    <option value="button">Quick Action (Buttons)</option>
                  </select>
                </div>
              )}

              {/* Submission Info */}
              {step.stepType === 'submission' && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <h4 className="font-medium text-blue-800 mb-2">Submission Step</h4>
                  <p className="text-sm text-blue-700">
                    Candidates will be able to record a video and/or submit a text message.
                  </p>
                </div>
              )}

              {/* Options */}
              {(step.stepType || 'question') === 'question' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Answer Options</label>
                    <button onClick={() => onAddOption(step.id)} className="text-blue-600 hover:text-blue-800 text-sm">
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
                            onChange={(e) => onUpdateOption(option.id, { nextStepId: e.target.value || null })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">End Flow</option>
                            {allSteps.filter((s) => s.id !== step.id).map((s) => (
                              <option key={s.id} value={s.id}>Go to: {s.title}</option>
                            ))}
                          </select>
                        </div>
                        <button onClick={() => onDeleteOption(step.id, option.id)} className="text-red-500 hover:text-red-700 p-1">
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
          )}

          {/* Form Tab */}
          {activeTab === 'form' && (
            <div className="space-y-4">
              {/* Enable Switch */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Collect Information</p>
                  <p className="text-xs text-gray-500">Show a form after this step</p>
                </div>
                <button
                  onClick={toggleFormEnabled}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    step.formEnabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      step.formEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {step.formEnabled && (
                <>
                  {/* Built-in Fields */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fields</label>
                    <div className="space-y-2">
                      {formConfig.fields.map((field) => (
                        <div key={field.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
                          {/* Enable toggle */}
                          <button
                            onClick={() => updateFormField(field.id, { enabled: !field.enabled })}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                              field.enabled ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                field.enabled ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>

                          {/* Field label */}
                          {field.isBuiltIn ? (
                            <div className="flex-1">
                              <span className="text-sm text-gray-700">{field.label}</span>
                              <span className="ml-2 text-xs text-gray-400">{field.type}</span>
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => updateFormField(field.id, { label: e.target.value })}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          )}

                          {/* Required toggle */}
                          {field.enabled && (
                            <button
                              onClick={() => updateFormField(field.id, { required: !field.required })}
                              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                                field.required
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {field.required ? 'Required' : 'Optional'}
                            </button>
                          )}

                          {/* Type selector for custom fields */}
                          {!field.isBuiltIn && (
                            <select
                              value={field.type}
                              onChange={(e) => updateFormField(field.id, { type: e.target.value as FormField['type'] })}
                              className="text-xs px-2 py-1 border border-gray-300 rounded"
                            >
                              <option value="text">Text</option>
                              <option value="email">Email</option>
                              <option value="phone">Phone</option>
                              <option value="textarea">Long Text</option>
                            </select>
                          )}

                          {/* Delete custom field */}
                          {!field.isBuiltIn && (
                            <button
                              onClick={() => removeCustomField(field.id)}
                              className="text-red-500 hover:text-red-700 text-sm"
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add Custom Field */}
                  <button
                    onClick={addCustomField}
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-md text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                  >
                    + Add Custom Field
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
