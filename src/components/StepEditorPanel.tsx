'use client'

import { useState, useRef } from 'react'
import { uploadVideoFile, triggerVideoAnalysis } from '@/lib/upload-client'
import CaptionedVideo, { type CaptionStyle, DEFAULT_CAPTION_STYLE } from './CaptionedVideo'

interface Segment {
  start: number
  end: number
  text: string
}

interface Video {
  id: string
  filename: string
  url: string
  displayName?: string | null
  summary?: string | null
  bulletPoints?: string[]
  transcript?: string | null
  segments?: Segment[] | null
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
  captionsEnabled?: boolean
  captionStyle?: CaptionStyle | null
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
  onClose?: () => void
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
  onClose,
}: StepEditorPanelProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState<{ text: string; segments: Array<{ start: number; end: number; text: string }> } | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<{ question: string; options: Array<{ text: string; isEndFlow: boolean }> } | null>(null)
  const [activeTab, setActiveTab] = useState<'quiz' | 'form'>('quiz')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [captionsEnabled, setCaptionsEnabledState] = useState(step.captionsEnabled || false)
  const [captionStyle, setCaptionStyleState] = useState<CaptionStyle>(
    (step.captionStyle as CaptionStyle) || DEFAULT_CAPTION_STYLE
  )

  // Load segments from video record on mount
  const videoSegments = step.video?.segments as Segment[] | null | undefined
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formConfig: FormConfig = (step.formConfig as FormConfig) || DEFAULT_FORM_CONFIG

  // Persist caption settings to step
  const setCaptionsEnabled = (enabled: boolean) => {
    setCaptionsEnabledState(enabled)
    onUpdateStep(step.id, { captionsEnabled: enabled } as Partial<Step>)
  }
  const setCaptionStyle = (style: CaptionStyle) => {
    setCaptionStyleState(style)
    onUpdateStep(step.id, { captionStyle: style } as Partial<Step>)
  }

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
        setAnalysisError(null)
        triggerVideoAnalysis(
          result.id,
          (analysis) => {
            setAnalyzing(false)
            setTranscript({ text: analysis.transcript, segments: analysis.segments || [] })
            if (analysis.segments?.length > 0) setCaptionsEnabled(true)
            // Auto-set step title from video analysis
            if (analysis.displayName) {
              onUpdateStep(step.id, { title: analysis.displayName })
            }
            onVideoUploaded?.({
              ...video,
              displayName: analysis.displayName,
              summary: analysis.summary,
              bulletPoints: analysis.bulletPoints,
              transcript: analysis.transcript,
            })
          },
          (error) => {
            setAnalyzing(false)
            setAnalysisError(error)
          }
        )
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
        setCaptionsEnabled(true)
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

  const [generatingTitle, setGeneratingTitle] = useState(false)
  const handleGenerateTitle = async () => {
    setGeneratingTitle(true)
    try {
      const videoTranscript = transcript?.text || step.video?.transcript || ''
      const videoSummary = step.video?.summary || ''
      const bulletPoints = step.video?.bulletPoints?.join(', ') || ''
      const res = await fetch('/api/ai/suggest-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: videoTranscript,
          stepTitle: step.title,
          flowContext: `Based on this video content, generate a short descriptive title (3-8 words) that summarizes what the video is about. The title should be like a section heading — descriptive and professional. Video summary: "${videoSummary}". Key points: ${bulletPoints}. Respond in JSON: {"question": "The Descriptive Title", "options": []}`,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.question) onUpdateStep(step.id, { title: data.question })
      }
    } catch {}
    setGeneratingTitle(false)
  }

  const aiSparkIcon = (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2L9 12l-7 0 5.5 4.5L5 22l7-5 7 5-2.5-5.5L22 12h-7L12 2z" />
    </svg>
  )

  return (
    <div className="space-y-4">
      {/* Header with Save/Cancel */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Edit Step</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDeleteStep(step.id)}
            className="text-red-600 hover:text-red-800 text-xs"
          >
            Delete
          </button>
          {onClose && (
            <>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>

      {/* Desktop: side-by-side | Mobile: stacked */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Video only */}
        <div className="lg:w-1/2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Video</label>
          <div className="flex gap-2">
            <select
              value={step.videoId || ''}
              onChange={(e) => {
                const videoId = e.target.value || null
                const selectedVideo = videos.find(v => v.id === videoId)
                const updates: Partial<Step> = { videoId }
                // Auto-set title from video displayName if step has default/empty title
                if (selectedVideo?.displayName && (!step.title || step.title === 'New Step' || step.title === 'Untitled Step')) {
                  updates.title = selectedVideo.displayName
                }
                onUpdateStep(step.id, updates)
              }}
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
              <CaptionedVideo
                src={step.video.url}
                segments={transcript?.segments || videoSegments || []}
                captionsEnabled={captionsEnabled}
                captionStyle={captionStyle}
                onStyleChange={setCaptionStyle}
                showStyleEditor={false}
              />
            </div>
          )}
        </div>

        {/* Right: Title, Transcription/Captions, Quiz/Form */}
        <div className="lg:w-1/2 space-y-4">
          {/* Title with AI generate */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Title</label>
              {(transcript?.text || step.video?.transcript) && (
                <button
                  onClick={handleGenerateTitle}
                  disabled={generatingTitle}
                  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                >
                  {aiSparkIcon}
                  {generatingTitle ? 'Generating...' : 'AI Generate'}
                </button>
              )}
            </div>
            <input
              type="text"
              value={step.title}
              onChange={(e) => onUpdateStep(step.id, { title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Analyzing indicator */}
          {analyzing && (
            <div className="flex items-center gap-2 text-sm text-purple-600">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing video — transcribing &amp; generating summary...
            </div>
          )}

          {/* Analysis error */}
          {analysisError && (
            <div className="bg-red-50 rounded-md p-3 border border-red-200">
              <p className="text-xs text-red-700">{analysisError}</p>
              <button onClick={() => setAnalysisError(null)} className="text-xs text-red-500 hover:text-red-700 mt-1">Dismiss</button>
            </div>
          )}

          {/* Video analysis info */}
          {step.video?.displayName && (
            <div className="bg-blue-50 rounded-md p-3 border border-blue-200">
              <p className="text-sm font-medium text-blue-900">{step.video.displayName}</p>
              {step.video.summary && <p className="text-xs text-blue-700 mt-1">{step.video.summary}</p>}
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

          {/* Transcription & Captions controls */}
          {step.video && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleTranscribe}
                  disabled={transcribing || analyzing}
                  className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-md hover:bg-purple-100 disabled:opacity-50 transition-colors"
                >
                  {transcribing ? 'Transcribing...' : transcript || videoSegments?.length ? 'Re-transcribe' : 'Generate Captions'}
                </button>
                {!step.video.displayName && !analyzing && (
                  <button
                    onClick={() => {
                      if (!step.videoId) return
                      setAnalyzing(true)
                      setAnalysisError(null)
                      triggerVideoAnalysis(
                        step.videoId,
                        (analysis) => {
                          setAnalyzing(false)
                          setTranscript({ text: analysis.transcript, segments: analysis.segments || [] })
                          if (analysis.segments?.length > 0) setCaptionsEnabled(true)
                          if (analysis.displayName) onUpdateStep(step.id, { title: analysis.displayName })
                          onVideoUploaded?.({
                            id: step.video!.id, filename: step.video!.filename, url: step.video!.url,
                            displayName: analysis.displayName, summary: analysis.summary,
                            bulletPoints: analysis.bulletPoints, transcript: analysis.transcript,
                          })
                        },
                        (error) => { setAnalyzing(false); setAnalysisError(error) }
                      )
                    }}
                    className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    Analyze Video
                  </button>
                )}

                {/* Captions toggle */}
                {((transcript && transcript.segments.length > 0) || (videoSegments && videoSegments.length > 0)) && (
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => setCaptionsEnabled(!captionsEnabled)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                        captionsEnabled ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        captionsEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                    <span className="text-xs text-gray-600">Captions</span>
                  </div>
                )}
              </div>

              {/* Caption style editor — shown when captions enabled */}
              {captionsEnabled && ((transcript && transcript.segments.length > 0) || (videoSegments && videoSegments.length > 0)) && (
                <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                  <span className="text-xs font-medium text-gray-500 uppercase mb-2 block">Caption Style</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500">Font</label>
                      <select
                        value={captionStyle.fontFamily}
                        onChange={e => setCaptionStyle({ ...captionStyle, fontFamily: e.target.value })}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                      >
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="'Courier New', monospace">Courier</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
                        <option value="Verdana, sans-serif">Verdana</option>
                        <option value="Impact, sans-serif">Impact</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500">Size</label>
                      <select
                        value={captionStyle.fontSize}
                        onChange={e => setCaptionStyle({ ...captionStyle, fontSize: Number(e.target.value) })}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                      >
                        <option value={12}>Small</option>
                        <option value={16}>Medium</option>
                        <option value={20}>Large</option>
                        <option value={24}>X-Large</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500">Color</label>
                      <div className="flex gap-1">
                        <input
                          type="color"
                          value={captionStyle.color}
                          onChange={e => setCaptionStyle({ ...captionStyle, color: e.target.value })}
                          className="w-6 h-6 rounded cursor-pointer border border-gray-300"
                        />
                        <span className="text-[10px] text-gray-400 self-center">{captionStyle.color}</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-gray-500 mb-1 block">Background</label>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { c: 'rgba(0, 0, 0, 0.9)', l: '90%' },
                          { c: 'rgba(0, 0, 0, 0.75)', l: '75%' },
                          { c: 'rgba(0, 0, 0, 0.5)', l: '50%' },
                          { c: 'rgba(255, 255, 255, 0.8)', l: 'W' },
                          { c: 'rgba(37, 99, 235, 0.8)', l: 'B' },
                          { c: 'rgba(220, 38, 38, 0.8)', l: 'R' },
                          { c: 'rgba(22, 163, 74, 0.8)', l: 'G' },
                          { c: 'rgba(234, 179, 8, 0.8)', l: 'Y' },
                          { c: 'rgba(147, 51, 234, 0.8)', l: 'P' },
                          { c: 'transparent', l: '∅' },
                        ].map(({ c, l }) => (
                          <button
                            key={c}
                            title={l}
                            onClick={() => setCaptionStyle({ ...captionStyle, backgroundColor: c })}
                            className={`w-5 h-5 rounded border transition-all ${
                              captionStyle.backgroundColor === c
                                ? 'border-blue-500 ring-1 ring-blue-300 scale-110'
                                : 'border-gray-300'
                            }`}
                            style={{
                              background: c === 'transparent'
                                ? 'repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 50% / 6px 6px'
                                : c,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Transcript text */}
              {transcript && (
                <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Transcript</span>
                    <button onClick={() => setTranscript(null)} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto text-sm">
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
            </div>
          )}

          {/* AI Suggestion */}
          {suggestion && (
            <div className="bg-amber-50 rounded-md p-3 border border-amber-200">
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
                  <button
                    onClick={handleSuggestQuestions}
                    disabled={suggesting || analyzing}
                    className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                  >
                    {aiSparkIcon}
                    {suggesting ? 'Generating...' : 'AI Generate'}
                  </button>
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
