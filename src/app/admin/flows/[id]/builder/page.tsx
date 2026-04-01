'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import FlowSchemaView from '@/components/FlowSchemaView'
import StepEditorPanel from '@/components/StepEditorPanel'
import StepPreviewModal from '@/components/StepPreviewModal'
import BrandingEditor from '@/components/BrandingEditor'
import { type BrandingConfig } from '@/lib/branding'

interface Video {
  id: string
  filename: string
  url: string
  displayName?: string | null
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
  stepType: string
  questionType: string
  infoContent?: string | null
  formEnabled?: boolean
  formConfig?: any
  captionsEnabled?: boolean
  captionStyle?: any
  options: Option[]
}

interface Flow {
  id: string
  name: string
  slug: string
  isPublished: boolean
  startMessage: string
  endMessage: string
  branding: Record<string, unknown> | null
  steps: Step[]
}

export default function FlowBuilderPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const flowId = params.id as string

  const [flow, setFlow] = useState<Flow | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'editor' | 'schema' | 'branding'>(
    searchParams.get('view') === 'schema' ? 'schema' : 'editor'
  )
  const [popupStepId, setPopupStepId] = useState<string | null>(null)
  const [previewStepId, setPreviewStepId] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    fetchFlow()
    fetchVideos()
  }, [flowId])

  const fetchFlow = async () => {
    const res = await fetch(`/api/flows/${flowId}`)
    if (res.ok) {
      const data = await res.json()
      setFlow(data)
      if (data.steps.length > 0 && !selectedStepId) {
        setSelectedStepId(data.steps[0].id)
      }
    }
  }

  const fetchVideos = async () => {
    const res = await fetch('/api/videos')
    if (res.ok) {
      const data = await res.json()
      setVideos(data)
    }
  }

  const selectedStep = flow?.steps.find((s) => s.id === selectedStepId)
  const popupStep = flow?.steps.find((s) => s.id === popupStepId)

  const markChanged = () => {
    setHasChanges(true)
    if (flow?.isPublished) {
      setFlow((f) => f ? { ...f, isPublished: false } : null)
      // Unpublish on backend
      fetch(`/api/flows/${flowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: false }),
      })
    }
  }

  const [showAddStepModal, setShowAddStepModal] = useState(false)
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 })
  const [isDraggingModal, setIsDraggingModal] = useState(false)
  const modalDragStart = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)

  useEffect(() => {
    if (!isDraggingModal) return
    const handleMove = (e: MouseEvent) => {
      if (!modalDragStart.current) return
      setModalPos({
        x: modalDragStart.current.startX + (e.clientX - modalDragStart.current.x),
        y: modalDragStart.current.startY + (e.clientY - modalDragStart.current.y),
      })
    }
    const handleUp = () => { setIsDraggingModal(false); modalDragStart.current = null }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp) }
  }, [isDraggingModal])
  const [addStepType, setAddStepType] = useState<string | null>(null)
  const [addStepTitle, setAddStepTitle] = useState('')
  const [addStepVideoId, setAddStepVideoId] = useState('')
  const [addStepQuestion, setAddStepQuestion] = useState('')
  const [addStepOptions, setAddStepOptions] = useState(['', ''])
  const [addStepQuestionType, setAddStepQuestionType] = useState('single')
  const [addStepFormFields, setAddStepFormFields] = useState([
    { id: 'name', label: 'Full Name', type: 'text', required: true, enabled: true, isBuiltIn: true },
    { id: 'email', label: 'Email', type: 'email', required: true, enabled: true, isBuiltIn: true },
    { id: 'phone', label: 'Phone', type: 'phone', required: false, enabled: true, isBuiltIn: true },
  ])
  const [addStepInfoText, setAddStepInfoText] = useState('')
  const [uploadingStepVideo, setUploadingStepVideo] = useState(false)
  const [autoTitleEnabled, setAutoTitleEnabled] = useState(true)
  const [titleWarning, setTitleWarning] = useState(false)
  const stepVideoInputRef = useRef<HTMLInputElement>(null)

  const createStep = async (stepType: string, config?: Record<string, unknown>) => {
    markChanged()
    const stepNum = (flow?.steps.length || 0) + 1
    const defaults: Record<string, Record<string, unknown>> = {
      question: { title: `Question ${stepNum}`, stepType: 'question', questionType: 'single' },
      submission: { title: `Video Response ${stepNum}`, stepType: 'submission' },
      form: { title: `Application Form`, stepType: 'form', formEnabled: true, formConfig: { fields: [
        { id: 'name', label: 'Full Name', type: 'text', required: true, enabled: true, isBuiltIn: true },
        { id: 'email', label: 'Email', type: 'email', required: true, enabled: true, isBuiltIn: true },
        { id: 'phone', label: 'Phone', type: 'phone', required: false, enabled: true, isBuiltIn: true },
      ] } },
      info: { title: `Welcome`, stepType: 'info', infoContent: '' },
    }
    const body = { ...defaults[stepType], ...config }

    const res = await fetch(`/api/flows/${flowId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const newStep = await res.json()
      setShowAddStepModal(false)
      // Re-fetch full flow to get video data on steps
      await fetchFlow()
      setSelectedStepId(newStep.id)
    }
  }

  const addStep = () => {
    setAddStepType(null)
    setAddStepTitle('')
    setAddStepVideoId('')
    setAddStepQuestion('')
    setAddStepOptions(['', ''])
    setAddStepQuestionType('single')
    setAddStepInfoText('')
    setAddStepFormFields([
      { id: 'name', label: 'Full Name', type: 'text', required: true, enabled: true, isBuiltIn: true },
      { id: 'email', label: 'Email', type: 'email', required: true, enabled: true, isBuiltIn: true },
      { id: 'phone', label: 'Phone', type: 'phone', required: false, enabled: true, isBuiltIn: true },
    ])
    setShowAddStepModal(true)
  }

  const handleStepVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('video/')) return
    setUploadingStepVideo(true)
    try {
      const { uploadVideoFile } = await import('@/lib/upload-client')
      const result = await uploadVideoFile(file)
      if (result.id) {
        setAddStepVideoId(result.id)
        setVideos(prev => [{ id: result.id!, filename: result.filename, url: result.url, displayName: null }, ...prev])
        if (!autoTitleEnabled && !addStepTitle) setAddStepTitle(file.name.replace(/\.[^.]+$/, ''))
        // Auto-generate title from transcript if toggle is on
        if (autoTitleEnabled) generateTitleFromVideo(result.id)
      }
    } catch {}
    setUploadingStepVideo(false)
    if (stepVideoInputRef.current) stepVideoInputRef.current.value = ''
  }

  const generateTitleFromVideo = async (videoId: string) => {
    try {
      // First check if video already has a displayName
      const vidRes = await fetch(`/api/videos/${videoId}`)
      if (vidRes.ok) {
        const vid = await vidRes.json()
        if (vid.displayName) { setAddStepTitle(vid.displayName); return }
        if (vid.transcript) {
          // Generate title from existing transcript
          const titleRes = await fetch('/api/ai/generate-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: vid.transcript, summary: vid.summary, bulletPoints: vid.bulletPoints?.join(', ') }),
          })
          if (titleRes.ok) { const { title } = await titleRes.json(); if (title) setAddStepTitle(title) }
          return
        }
      }
      // If no transcript yet, wait for analysis then generate
      setAddStepTitle('Generating title...')
      const analyzeRes = await fetch(`/api/videos/${videoId}/analyze`, { method: 'POST' })
      if (analyzeRes.ok) {
        const data = await analyzeRes.json()
        if (data.displayName) setAddStepTitle(data.displayName)
        else if (data.transcript) {
          const titleRes = await fetch('/api/ai/generate-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: data.transcript, summary: data.summary }),
          })
          if (titleRes.ok) { const { title } = await titleRes.json(); if (title) setAddStepTitle(title) }
        }
      }
    } catch { /* keep whatever title we have */ }
  }

  const submitAddStep = () => {
    if (!addStepType) return
    // Validate title
    if (!addStepTitle.trim() && !autoTitleEnabled) {
      setTitleWarning(true)
      return
    }
    setTitleWarning(false)
    const config: Record<string, unknown> = {}
    if (addStepType === 'submission') {
      config.title = addStepTitle.trim() || 'Video Response'
      config.videoId = addStepVideoId || undefined
    } else if (addStepType === 'question') {
      config.title = addStepTitle.trim() || addStepQuestion || 'Question'
      config.questionText = addStepQuestion
      config.questionType = addStepQuestionType
      config.options = addStepOptions.filter(o => o.trim())
    } else if (addStepType === 'form') {
      config.title = addStepTitle.trim() || 'Application Form'
      config.formConfig = { fields: addStepFormFields }
    } else if (addStepType === 'info') {
      config.title = addStepTitle.trim() || 'Welcome'
      config.infoContent = addStepInfoText
    }
    createStep(addStepType, config)
  }

  const updateStep = async (stepId: string, data: Partial<Step>) => {
    markChanged()
    setSaving(true)
    const res = await fetch(`/api/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      setFlow((f) =>
        f
          ? {
              ...f,
              steps: f.steps.map((s) => (s.id === stepId ? { ...s, ...updated } : s)),
            }
          : null
      )
    }
    setSaving(false)
  }

  const deleteStep = (stepId: string) => {
    markChanged()
    // Optimistic UI update — remove immediately
    setFlow((f) => (f ? { ...f, steps: f.steps.filter((s) => s.id !== stepId) } : null))
    if (selectedStepId === stepId) setSelectedStepId(null)
    if (popupStepId === stepId) setPopupStepId(null)
    // Fire API call in background
    fetch(`/api/steps/${stepId}`, { method: 'DELETE' })
  }

  const changeFirstStep = (newFirstStepId: string) => {
    markChanged()
    if (!flow) return
    const sorted = [...flow.steps].sort((a, b) => a.stepOrder - b.stepOrder)
    if (sorted[0]?.id === newFirstStepId) return

    // Give the new first step order -1 (before all others) instead of swapping
    const minOrder = Math.min(...flow.steps.map((s) => s.stepOrder)) - 1
    setFlow((f) =>
      f
        ? {
            ...f,
            steps: f.steps.map((s) =>
              s.id === newFirstStepId ? { ...s, stepOrder: minOrder } : s
            ),
          }
        : null
    )

    fetch(`/api/steps/${newFirstStepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepOrder: minOrder }),
    })
  }

  const changeEndStep = (newEndStepId: string) => {
    markChanged()
    if (!flow) return
    const sorted = [...flow.steps].sort((a, b) => a.stepOrder - b.stepOrder)
    if (sorted[sorted.length - 1]?.id === newEndStepId) return

    // Give the new end step order maxOrder + 1 (after all others)
    const maxOrder = Math.max(...flow.steps.map((s) => s.stepOrder)) + 1
    setFlow((f) =>
      f
        ? {
            ...f,
            steps: f.steps.map((s) =>
              s.id === newEndStepId ? { ...s, stepOrder: maxOrder } : s
            ),
          }
        : null
    )

    fetch(`/api/steps/${newEndStepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepOrder: maxOrder }),
    })
  }

  const addOption = async (stepId: string) => {
    markChanged()
    const res = await fetch(`/api/steps/${stepId}/options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionText: 'New Option' }),
    })
    if (res.ok) {
      const newOption = await res.json()
      setFlow((f) =>
        f
          ? {
              ...f,
              steps: f.steps.map((s) =>
                s.id === stepId ? { ...s, options: [...s.options, newOption] } : s
              ),
            }
          : null
      )
    }
  }

  const updateOption = async (
    optionId: string,
    data: { optionText?: string; nextStepId?: string | null }
  ) => {
    markChanged()
    const res = await fetch(`/api/options/${optionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      setFlow((f) =>
        f
          ? {
              ...f,
              steps: f.steps.map((s) => ({
                ...s,
                options: s.options.map((o) => (o.id === optionId ? { ...o, ...updated } : o)),
              })),
            }
          : null
      )
    }
  }

  const connectSteps = async (fromStepId: string, toStepId: string) => {
    markChanged()
    // Create a new option on the source step pointing to the target
    const res = await fetch(`/api/steps/${fromStepId}/options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionText: 'Continue' }),
    })
    if (res.ok) {
      const newOption = await res.json()
      // Set the nextStepId
      await fetch(`/api/options/${newOption.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStepId: toStepId }),
      })
      // Optimistic update
      setFlow((f) =>
        f
          ? {
              ...f,
              steps: f.steps.map((s) =>
                s.id === fromStepId
                  ? { ...s, options: [...s.options, { ...newOption, nextStepId: toStepId }] }
                  : s
              ),
            }
          : null
      )
    }
  }

  const deleteOption = async (stepId: string, optionId: string) => {
    markChanged()
    await fetch(`/api/options/${optionId}`, { method: 'DELETE' })
    setFlow((f) =>
      f
        ? {
            ...f,
            steps: f.steps.map((s) =>
              s.id === stepId
                ? { ...s, options: s.options.filter((o) => o.id !== optionId) }
                : s
            ),
          }
        : null
    )
  }

  const updateFlow = async (data: { startMessage?: string; endMessage?: string }) => {
    markChanged()
    setSaving(true)
    const res = await fetch(`/api/flows/${flowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      setFlow((f) => (f ? { ...f, ...updated } : null))
    }
    setSaving(false)
  }

  const handleCancel = () => {
    // Reload from server to discard local changes
    fetchFlow()
    setHasChanges(false)
    setPopupStepId(null)
  }

  const handleSave = () => {
    // All changes are already persisted via individual API calls
    setHasChanges(false)
  }

  const handlePublish = async () => {
    const res = await fetch(`/api/flows/${flowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: true }),
    })
    if (res.ok) {
      setFlow((f) => (f ? { ...f, isPublished: true } : null))
      setHasChanges(false)
    }
  }

  const handleUnpublish = async () => {
    const res = await fetch(`/api/flows/${flowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: false }),
    })
    if (res.ok) {
      setFlow((f) => (f ? { ...f, isPublished: false } : null))
    }
  }

  const copyShareLink = () => {
    if (!flow) return
    const url = `${window.location.origin}/f/${flow.slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!flow) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  // --- Shared editor content for Start/End screens ---
  const renderStartEditor = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-grey-20 mb-1.5">Welcome Message</label>
        <textarea
          value={flow.startMessage}
          onChange={(e) => updateFlow({ startMessage: e.target.value })}
          rows={4}
          placeholder="Welcome! Please complete the following steps."
          className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-grey-20 mb-1.5">Background Image (optional)</label>
        <label className="block w-full p-4 border-2 border-dashed border-surface-divider rounded-[8px] text-center cursor-pointer hover:border-brand-400">
          <svg className="w-8 h-8 mx-auto text-grey-50 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <span className="text-xs text-grey-40">Upload image</span>
          <input type="file" accept="image/*" className="hidden" />
        </label>
      </div>
    </div>
  )

  const renderEndEditor = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-grey-20 mb-1.5">Completion Message</label>
        <textarea
          value={flow.endMessage}
          onChange={(e) => updateFlow({ endMessage: e.target.value })}
          rows={4}
          placeholder="Thank you for your participation!"
          className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-grey-20 mb-1.5">Background Image (optional)</label>
        <label className="block w-full p-4 border-2 border-dashed border-surface-divider rounded-[8px] text-center cursor-pointer hover:border-brand-400">
          <svg className="w-8 h-8 mx-auto text-grey-50 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <span className="text-xs text-grey-40">Upload image</span>
          <input type="file" accept="image/*" className="hidden" />
        </label>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b">
        <div className="flex items-center space-x-4">
          <Link href="/admin/flows" className="text-gray-500 hover:text-gray-700">
            &larr; Back
          </Link>
          <h1 className="text-xl font-bold text-gray-900">{flow.name}</h1>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex rounded-md border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode('editor')}
              className={`px-3 py-1.5 text-sm ${
                viewMode === 'editor'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Editor
            </button>
            <button
              onClick={() => setViewMode('schema')}
              className={`px-3 py-1.5 text-sm ${
                viewMode === 'schema'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Schema
            </button>
            <button
              onClick={() => setViewMode('branding')}
              className={`px-3 py-1.5 text-sm ${
                viewMode === 'branding'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Branding
            </button>
          </div>
          <button
            onClick={() => window.open(`/f/${flow.slug}?preview=true`, '_blank')}
            className="px-3 py-1.5 text-sm border border-purple-300 text-purple-600 rounded-md hover:bg-purple-50"
          >
            Preview
          </button>
          <button
            onClick={copyShareLink}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>

          {/* Status badge */}
          <span
            className={`px-3 py-1.5 text-sm rounded-md ${
              flow.isPublished
                ? 'bg-green-100 text-green-700'
                : hasChanges
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700'
            }`}
          >
            {flow.isPublished ? 'Published' : hasChanges ? 'Unsaved changes' : 'Draft'}
          </span>

          {/* Action buttons */}
          {hasChanges ? (
            <>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900"
              >
                Save
              </button>
              <button
                onClick={handlePublish}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Publish
              </button>
            </>
          ) : flow.isPublished ? (
            <button
              onClick={handleUnpublish}
              className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-md hover:bg-red-50"
            >
              Unpublish
            </button>
          ) : (
            <button
              onClick={handlePublish}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Publish
            </button>
          )}
        </div>
      </div>

      {viewMode === 'branding' ? (
        <div className="flex-1 min-h-0 p-4 overflow-y-auto">
          <BrandingEditor
            branding={flow.branding as Partial<BrandingConfig> | null}
            onUpdate={(branding) => {
              fetch(`/api/flows/${flow.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branding }),
              }).then(() => fetchFlow())
            }}
            flowName={flow.name}
            startMessage={flow.startMessage}
            endMessage={flow.endMessage}
          />
        </div>
      ) : viewMode === 'schema' ? (
        <div className="flex-1 min-h-0 relative">
          <FlowSchemaView
            steps={flow.steps}
            startMessage={flow.startMessage}
            endMessage={flow.endMessage}
            selectedStepId={popupStepId || selectedStepId}
            onStepClick={(stepId) => {
              // All nodes open editor on single click
              setPopupStepId(stepId)
              setSelectedStepId(stepId)
              setModalPos({ x: 0, y: 0 })
            }}
            onStepPreview={(stepId) => {
              setPreviewStepId(stepId)
              setPopupStepId(null)
            }}
            onDeleteStep={(stepId) => {
              deleteStep(stepId)
              setPopupStepId(null)
            }}
            onOptionUpdate={(optionId, data) => {
              updateOption(optionId, data)
            }}
            onConnectSteps={connectSteps}
            onChangeFirstStep={changeFirstStep}
            onChangeEndStep={changeEndStep}
            onAddStep={addStep}
          />

          {/* Popup editor overlay */}
          {popupStepId && (
            <div
              className="absolute inset-0 flex items-center justify-center z-30 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setPopupStepId(null)}
            >
              <div
                className="bg-white rounded-[12px] shadow-2xl border border-surface-border w-full max-w-[480px] max-h-[85vh] overflow-y-auto p-5"
                style={{ cursor: isDraggingModal ? 'grabbing' : 'default', transform: `translate(${modalPos.x}px, ${modalPos.y}px)` }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing select-none"
                  onMouseDown={(e) => {
                    setIsDraggingModal(true)
                    modalDragStart.current = { x: e.clientX, y: e.clientY, startX: modalPos.x, startY: modalPos.y }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      popupStepId === '__start__' ? 'bg-green-100 text-green-700' :
                      popupStepId === '__end__' ? 'bg-red-100 text-red-700' :
                      popupStep?.stepType === 'submission' ? 'bg-brand-50 text-brand-600' :
                      popupStep?.stepType === 'question' ? 'bg-blue-50 text-blue-600' :
                      popupStep?.stepType === 'form' ? 'bg-green-50 text-green-600' :
                      popupStep?.stepType === 'info' ? 'bg-purple-50 text-purple-600' :
                      'bg-surface text-grey-40'
                    }`}>
                      {popupStepId === '__start__' ? 'Start Screen' :
                       popupStepId === '__end__' ? 'End Screen' :
                       popupStep?.stepType === 'submission' ? 'Video' :
                       popupStep?.stepType === 'question' ? 'Question' :
                       popupStep?.stepType === 'form' ? 'Form' :
                       popupStep?.stepType === 'info' ? 'Screen' : 'Step'}
                    </span>
                    {popupStep && (
                      <input
                        key={`popup-title-${popupStep.id}`}
                        type="text"
                        defaultValue={popupStep.title}
                        onBlur={(e) => { if (e.target.value !== popupStep.title) updateStep(popupStep.id, { title: e.target.value }) }}
                        className="text-lg font-semibold text-grey-15 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-brand-400 focus:bg-brand-50 rounded px-1"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {popupStep && (
                      <button onClick={() => { deleteStep(popupStep.id); setPopupStepId(null) }} className="text-xs text-brand-500 hover:text-brand-600">Delete</button>
                    )}
                    <button onClick={() => setPopupStepId(null)} className="text-grey-40 hover:text-grey-15 text-xl leading-none">&times;</button>
                  </div>
                </div>

                {popupStepId === '__start__' ? (
                  renderStartEditor()
                ) : popupStepId === '__end__' ? (
                  renderEndEditor()
                ) : popupStep ? (
                  <div className="space-y-4">
                    {/* === VIDEO STEP === */}
                    {popupStep.stepType === 'submission' && (
                      <div className="space-y-4">
                        {/* Video select + upload */}
                        <div>
                          <label className="block text-sm font-medium text-grey-20 mb-1.5">Video</label>
                          <div className="flex gap-2">
                            <select
                              value={popupStep.videoId || ''}
                              onChange={(e) => updateStep(popupStep.id, { videoId: e.target.value || null })}
                              className="flex-1 px-4 py-2.5 text-sm border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                              <option value="">Select video...</option>
                              {videos.map(v => <option key={v.id} value={v.id}>{v.displayName || v.filename}</option>)}
                            </select>
                            <label className="px-4 py-2.5 text-xs font-medium bg-brand-50 text-brand-600 border border-brand-200 rounded-[8px] hover:bg-brand-100 cursor-pointer">
                              Upload
                              <input type="file" accept="video/*" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0]; if (!file) return
                                const { uploadVideoFile } = await import('@/lib/upload-client')
                                const result = await uploadVideoFile(file)
                                if (result.id) {
                                  setVideos(prev => [{ id: result.id!, filename: result.filename, url: result.url, displayName: null }, ...prev])
                                  updateStep(popupStep.id, { videoId: result.id })
                                }
                              }} />
                            </label>
                          </div>
                        </div>
                        {/* Video preview */}
                        {popupStep.video?.url && (
                          <video src={popupStep.video.url} controls className="w-full rounded-[8px] max-h-[50vh] object-contain" />
                        )}
                      </div>
                    )}

                    {/* === QUESTION STEP === */}
                    {popupStep.stepType === 'question' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-grey-20 mb-1.5">Question</label>
                          <textarea
                            key={`q-${popupStep.id}`}
                            defaultValue={popupStep.questionText || ''}
                            onBlur={(e) => updateStep(popupStep.id, { questionText: e.target.value })}
                            rows={2}
                            placeholder="e.g. What experience do you have?"
                            className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-grey-20 mb-1.5">Question Type</label>
                          <div className="grid grid-cols-3 gap-2">
                            {[{ v: 'single', l: 'Single Choice' }, { v: 'multiselect', l: 'Multi Choice' }, { v: 'yesno', l: 'Yes / No' }].map(({ v, l }) => (
                              <button key={v} onClick={() => updateStep(popupStep.id, { questionType: v })} className={`py-2 text-xs rounded-[8px] border font-medium ${popupStep.questionType === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}>{l}</button>
                            ))}
                          </div>
                        </div>
                        {/* Options */}
                        {popupStep.questionType !== 'yesno' && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-sm font-medium text-grey-20">Answer Options</label>
                              <button onClick={() => addOption(popupStep.id)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">+ Add option</button>
                            </div>
                            <div className="space-y-2">
                              {popupStep.options.map((opt) => (
                                <div key={opt.id} className="flex items-center gap-2">
                                  <input
                                    key={`opt-${opt.id}`}
                                    type="text"
                                    defaultValue={opt.optionText}
                                    onBlur={(e) => updateOption(opt.id, { optionText: e.target.value })}
                                    placeholder="Option text"
                                    className="flex-1 px-3 py-2.5 text-sm border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  />
                                  <button onClick={() => deleteOption(popupStep.id, opt.id)} className="text-brand-400 hover:text-brand-600 text-lg">&times;</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* === FORM STEP === */}
                    {popupStep.stepType === 'form' && (
                      <StepEditorPanel
                        step={popupStep}
                        allSteps={flow.steps}
                        videos={videos}
                        onUpdateStep={updateStep}
                        onDeleteStep={(id) => { deleteStep(id); setPopupStepId(null) }}
                        onAddOption={addOption}
                        onUpdateOption={updateOption}
                        onDeleteOption={deleteOption}
                        onVideoUploaded={(video) => { setVideos(prev => [video, ...prev]); fetchFlow() }}
                        onClose={() => setPopupStepId(null)}
                      />
                    )}

                    {/* === INFO/SCREEN STEP === */}
                    {popupStep.stepType === 'info' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-grey-20 mb-1.5">Content</label>
                          <textarea
                            key={`info-${popupStep.id}`}
                            defaultValue={popupStep.infoContent || ''}
                            onBlur={(e) => updateStep(popupStep.id, { infoContent: e.target.value })}
                            rows={6}
                            placeholder="Instructions, welcome message, or any information..."
                            className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-grey-20 mb-1.5">Background Image (optional)</label>
                          <label className="block w-full p-4 border-2 border-dashed border-surface-divider rounded-[8px] text-center cursor-pointer hover:border-brand-400">
                            <svg className="w-8 h-8 mx-auto text-grey-50 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span className="text-xs text-grey-40">Upload image</span>
                            <input type="file" accept="image/*" className="hidden" />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Step Preview Modal */}
          {previewStepId && (
            <StepPreviewModal
              previewId={previewStepId}
              step={flow.steps.find((s) => s.id === previewStepId) || null}
              allSteps={flow.steps}
              flowName={flow.name}
              startMessage={flow.startMessage}
              endMessage={flow.endMessage}
              onClose={() => setPreviewStepId(null)}
              onNavigate={(nextId) => {
                setPreviewStepId(nextId)
                setSelectedStepId(nextId)
              }}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Steps List */}
          <div className="w-64 bg-white rounded-lg shadow p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Steps</h2>
              <button onClick={addStep} className="text-blue-600 hover:text-blue-800 text-sm">
                + Add
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {/* Start Screen */}
              <button
                onClick={() => setSelectedStepId('__start__')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedStepId === '__start__'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="font-medium">Start Screen</div>
                <div className="text-xs text-gray-500">Welcome message</div>
              </button>

              <div className="border-t border-gray-100 my-1" />

              {flow.steps.map((step) => (
                <button
                  key={step.id}
                  onClick={() => setSelectedStepId(step.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedStepId === step.id
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="font-medium truncate">{step.title}</div>
                  <div className="text-xs text-gray-500">
                    {step.stepType === 'submission' ? (
                      <span className="text-purple-600">Submission</span>
                    ) : (
                      <>
                        {step.options.length} option{step.options.length !== 1 && 's'}
                        {step.questionType === 'multiselect' && ' (multi)'}
                      </>
                    )}
                  </div>
                </button>
              ))}

              <div className="border-t border-gray-100 my-1" />

              {/* End Screen */}
              <button
                onClick={() => setSelectedStepId('__end__')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedStepId === '__end__'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="font-medium">End Screen</div>
                <div className="text-xs text-gray-500">Completion message</div>
              </button>
            </div>
          </div>

          {/* Step Editor */}
          <div className="flex-1 bg-white rounded-lg shadow p-6 overflow-y-auto">
            {selectedStepId === '__start__' ? (
              renderStartEditor()
            ) : selectedStepId === '__end__' ? (
              renderEndEditor()
            ) : selectedStep ? (
              <StepEditorPanel
                step={selectedStep}
                allSteps={flow.steps}
                videos={videos}
                onUpdateStep={updateStep}
                onDeleteStep={deleteStep}
                onAddOption={addOption}
                onUpdateOption={updateOption}
                onDeleteOption={deleteOption}
                onVideoUploaded={(video) => {
                  setVideos((prev) => [video, ...prev])
                  fetchFlow()
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                {flow.steps.length === 0
                  ? 'Add your first step to get started'
                  : 'Select a step to edit'}
              </div>
            )}
          </div>
        </div>
      )}

      {saving && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md text-sm">
          Saving...
        </div>
      )}

      {/* Add Step Modal */}
      {showAddStepModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50" onClick={() => setShowAddStepModal(false)}>
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-[560px] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0">
              <div className="flex items-center gap-3">
                {addStepType && (
                  <button onClick={() => setAddStepType(null)} className="text-grey-40 hover:text-grey-15">&larr;</button>
                )}
                <h2 className="text-xl font-semibold text-grey-15">
                  {!addStepType ? 'Add Step' : addStepType === 'submission' ? 'Video Step' : addStepType === 'question' ? 'Question Step' : addStepType === 'form' ? 'Form Step' : 'Screen Step'}
                </h2>
              </div>
              <button onClick={() => setShowAddStepModal(false)} className="text-grey-40 hover:text-grey-15 text-xl">&times;</button>
            </div>

            <div className="p-6">
              {/* Phase 1: Choose type */}
              {!addStepType && (
                <>
                  <p className="text-sm text-grey-35 mb-5">Choose what type of step to add.</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { type: 'submission', label: 'Video', desc: 'Upload video + title', color: 'brand', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
                      { type: 'question', label: 'Question', desc: 'Quiz with options', color: 'blue', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                      { type: 'form', label: 'Form', desc: 'Collect candidate info', color: 'green', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                      { type: 'info', label: 'Screen', desc: 'Text, instructions, image', color: 'purple', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                    ].map(({ type, label, desc, color, icon }) => (
                      <button
                        key={type}
                        onClick={() => setAddStepType(type)}
                        className={`flex flex-col items-center gap-3 p-6 rounded-[12px] border-2 border-surface-border hover:border-brand-500 hover:bg-brand-50 transition-all group`}
                      >
                        <div className={`w-14 h-14 rounded-[12px] bg-${color}-50 group-hover:bg-${color}-100 flex items-center justify-center`}>
                          <svg className={`w-7 h-7 text-${color}-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
                          </svg>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-grey-15 text-sm">{label}</div>
                          <div className="text-[11px] text-grey-40 mt-0.5">{desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Phase 2: Video config */}
              {addStepType === 'submission' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium text-grey-20">Step Title</label>
                      <button
                        onClick={() => {
                          const next = !autoTitleEnabled
                          setAutoTitleEnabled(next)
                          if (next && addStepVideoId) generateTitleFromVideo(addStepVideoId)
                        }}
                        className="flex items-center gap-2"
                      >
                        <span className={`text-[11px] ${autoTitleEnabled ? 'text-brand-500' : 'text-grey-40'}`}>
                          {autoTitleEnabled ? 'AI title' : 'Manual'}
                        </span>
                        <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoTitleEnabled ? 'bg-[#FF9500]' : 'bg-gray-300'}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoTitleEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={addStepTitle}
                      onChange={(e) => { setAddStepTitle(e.target.value); setTitleWarning(false) }}
                      onFocus={() => { if (autoTitleEnabled) setAutoTitleEnabled(false) }}
                      placeholder={autoTitleEnabled ? 'Will be generated from video transcript...' : 'e.g. Introduction Video'}
                      className={`w-full px-4 py-3 border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500 ${titleWarning ? 'border-red-400 bg-red-50/30' : autoTitleEnabled ? 'border-brand-200 bg-brand-50/30 text-grey-40' : 'border-surface-border'}`}
                    />
                    {titleWarning && (
                      <div className="mt-2 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-[8px]">
                        <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                        <div className="flex-1">
                          <p className="text-sm text-red-700 font-medium">Step title is required</p>
                          <p className="text-xs text-red-600 mt-0.5">Enter a title manually or let AI generate one from the video.</p>
                          <button
                            onClick={() => { setAutoTitleEnabled(true); setTitleWarning(false); if (addStepVideoId) generateTitleFromVideo(addStepVideoId) }}
                            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-500 hover:text-brand-600"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            Generate title automatically
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-grey-20 mb-1.5">Upload Video</label>
                    {addStepVideoId ? (
                      <div className="flex items-center gap-3 p-3 bg-brand-50 rounded-[8px] border border-brand-200">
                        <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        <span className="text-sm text-brand-700 font-medium">Video uploaded</span>
                        <button onClick={() => setAddStepVideoId('')} className="ml-auto text-xs text-brand-500">Change</button>
                      </div>
                    ) : (
                      <label className={`block w-full p-6 border-2 border-dashed rounded-[8px] text-center cursor-pointer transition-colors ${uploadingStepVideo ? 'border-brand-300 bg-brand-50' : 'border-surface-divider hover:border-brand-400'}`}>
                        <svg className="w-10 h-10 mx-auto text-grey-50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        <span className="text-sm text-grey-40">{uploadingStepVideo ? 'Uploading...' : 'Click to upload or drag video here'}</span>
                        <input ref={stepVideoInputRef} type="file" accept="video/*" onChange={handleStepVideoUpload} disabled={uploadingStepVideo} className="hidden" />
                      </label>
                    )}
                    <p className="text-xs text-grey-40 mt-2">Or select existing:</p>
                    <select value={addStepVideoId} onChange={(e) => { setAddStepVideoId(e.target.value); if (e.target.value && autoTitleEnabled) generateTitleFromVideo(e.target.value) }} className="w-full mt-1 px-3 py-2 text-sm border border-surface-border rounded-[8px]">
                      <option value="">Choose from library...</option>
                      {videos.map(v => <option key={v.id} value={v.id}>{v.displayName || v.filename}</option>)}
                    </select>
                  </div>
                  <button onClick={submitAddStep} className="w-full btn-primary py-3">Add Video Step</button>
                </div>
              )}

              {/* Phase 2: Question config */}
              {addStepType === 'question' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-grey-20 mb-1.5">Question</label>
                    <textarea value={addStepQuestion} onChange={(e) => setAddStepQuestion(e.target.value)} rows={2} placeholder="e.g. What experience do you have?" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-grey-20 mb-1.5">Question Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'single', label: 'Single Choice' },
                        { value: 'multiselect', label: 'Multi Choice' },
                        { value: 'yesno', label: 'Yes / No' },
                      ].map(({ value, label }) => (
                        <button key={value} onClick={() => setAddStepQuestionType(value)} className={`py-2 text-xs rounded-[8px] border font-medium ${addStepQuestionType === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border text-grey-35'}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                  {addStepQuestionType !== 'yesno' && (
                    <div>
                      <label className="block text-sm font-medium text-grey-20 mb-1.5">Answer Options</label>
                      <div className="space-y-2">
                        {addStepOptions.map((opt, i) => (
                          <div key={i} className="flex gap-2">
                            <input type="text" value={opt} onChange={(e) => { const n = [...addStepOptions]; n[i] = e.target.value; setAddStepOptions(n) }} placeholder={`Option ${i + 1}`} className="flex-1 px-3 py-2 text-sm border border-surface-border rounded-[8px] focus:outline-none focus:ring-1 focus:ring-brand-500" />
                            {addStepOptions.length > 2 && (
                              <button onClick={() => setAddStepOptions(addStepOptions.filter((_, j) => j !== i))} className="text-brand-400 hover:text-brand-600 text-sm px-2">&times;</button>
                            )}
                          </div>
                        ))}
                        <button onClick={() => setAddStepOptions([...addStepOptions, ''])} className="text-xs text-brand-500 hover:text-brand-600 font-medium">+ Add option</button>
                      </div>
                    </div>
                  )}
                  <button onClick={submitAddStep} className="w-full btn-primary py-3">Add Question Step</button>
                </div>
              )}

              {/* Phase 2: Form config */}
              {addStepType === 'form' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-grey-20 mb-1.5">Form Title</label>
                    <input type="text" value={addStepTitle} onChange={(e) => setAddStepTitle(e.target.value)} placeholder="e.g. Candidate Information" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-grey-20 mb-2">Fields</label>
                    <div className="space-y-2">
                      {addStepFormFields.map((field, i) => (
                        <div key={field.id} className="flex items-center gap-3 p-3 rounded-[8px] border border-surface-border">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={field.enabled} onChange={() => { const n = [...addStepFormFields]; n[i] = { ...n[i], enabled: !n[i].enabled }; setAddStepFormFields(n) }} className="rounded accent-[#FF9500]" />
                          </label>
                          <span className="text-sm text-grey-15 flex-1">{field.label}</span>
                          <label className="flex items-center gap-1.5 text-xs text-grey-40">
                            <input type="checkbox" checked={field.required} onChange={() => { const n = [...addStepFormFields]; n[i] = { ...n[i], required: !n[i].required }; setAddStepFormFields(n) }} className="rounded accent-[#FF9500]" />
                            Required
                          </label>
                          {!field.isBuiltIn && (
                            <button onClick={() => setAddStepFormFields(addStepFormFields.filter((_, j) => j !== i))} className="text-brand-400 hover:text-brand-600 text-sm">&times;</button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => setAddStepFormFields([...addStepFormFields, { id: `custom_${Date.now()}`, label: 'Custom Field', type: 'text', required: false, enabled: true, isBuiltIn: false }])} className="text-xs text-brand-500 hover:text-brand-600 font-medium">+ Add custom field</button>
                    </div>
                  </div>
                  <button onClick={submitAddStep} className="w-full btn-primary py-3">Add Form Step</button>
                </div>
              )}

              {/* Phase 2: Screen / Info config */}
              {addStepType === 'info' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-grey-20 mb-1.5">Screen Title</label>
                    <input type="text" value={addStepTitle} onChange={(e) => setAddStepTitle(e.target.value)} placeholder="e.g. Welcome, Next Steps, Thank You" className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-grey-20 mb-1.5">Content Text</label>
                    <textarea value={addStepInfoText} onChange={(e) => setAddStepInfoText(e.target.value)} rows={5} placeholder="Instructions, welcome message, or any information to show the candidate..." className="w-full px-4 py-3 border border-surface-border rounded-[8px] text-grey-15 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-grey-20 mb-1.5">Background Image (optional)</label>
                    <label className="block w-full p-4 border-2 border-dashed border-surface-divider rounded-[8px] text-center cursor-pointer hover:border-brand-400 transition-colors">
                      <svg className="w-8 h-8 mx-auto text-grey-50 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <span className="text-xs text-grey-40">Upload image</span>
                      <input type="file" accept="image/*" className="hidden" />
                    </label>
                  </div>
                  <button onClick={submitAddStep} className="w-full btn-primary py-3">Add Screen Step</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
