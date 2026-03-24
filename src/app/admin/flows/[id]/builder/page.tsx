'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import FlowSchemaView from '@/components/FlowSchemaView'
import StepEditorPanel from '@/components/StepEditorPanel'
import StepPreviewModal from '@/components/StepPreviewModal'

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

interface Flow {
  id: string
  name: string
  slug: string
  isPublished: boolean
  startMessage: string
  endMessage: string
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
  const [viewMode, setViewMode] = useState<'editor' | 'schema'>(
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

  const addStep = async () => {
    markChanged()
    const res = await fetch(`/api/flows/${flowId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Step ${(flow?.steps.length || 0) + 1}`,
        stepType: 'question',
        questionType: 'single',
      }),
    })
    if (res.ok) {
      const newStep = await res.json()
      const fullStep = {
        ...newStep,
        options: [],
        stepType: newStep.stepType || 'question',
        questionType: newStep.questionType || 'single',
      }

      setFlow((f) => (f ? { ...f, steps: [...f.steps, fullStep] } : null))
      if (viewMode === 'schema') {
        setPopupStepId(newStep.id)
      } else {
        setSelectedStepId(newStep.id)
      }
    }
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
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Start Screen</h2>
      <p className="text-sm text-gray-500">
        This is the first thing candidates see when they open your flow link.
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Welcome Message</label>
        <textarea
          value={flow.startMessage}
          onChange={(e) => updateFlow({ startMessage: e.target.value })}
          rows={3}
          placeholder="Welcome to the video interview"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="bg-green-50 border border-green-200 rounded-md p-4">
        <h4 className="font-medium text-green-800 mb-2">Preview</h4>
        <div className="bg-white rounded-lg p-4 text-center">
          <p className="font-bold text-gray-900 mb-2">{flow.name}</p>
          <p className="text-gray-600 text-sm mb-3">{flow.startMessage}</p>
          <div className="text-xs text-gray-400 border border-gray-200 rounded px-3 py-2 mb-2">
            Name input field
          </div>
          <div className="bg-blue-600 text-white text-sm rounded px-4 py-2 inline-block">
            Start
          </div>
        </div>
      </div>
    </div>
  )

  const renderEndEditor = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">End Screen</h2>
      <p className="text-sm text-gray-500">
        Shown when a candidate finishes the flow. All steps that don&apos;t lead to another step
        will reach this screen.
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Completion Message</label>
        <textarea
          value={flow.endMessage}
          onChange={(e) => updateFlow({ endMessage: e.target.value })}
          rows={3}
          placeholder="Thank you for your participation!"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <h4 className="font-medium text-red-800 mb-2">Preview</h4>
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <span className="text-green-600 text-lg">&#10003;</span>
          </div>
          <p className="font-bold text-gray-900 mb-1">All Done!</p>
          <p className="text-gray-600 text-sm">{flow.endMessage}</p>
        </div>
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

      {viewMode === 'schema' ? (
        <div className="flex-1 min-h-0 relative">
          <FlowSchemaView
            steps={flow.steps}
            startMessage={flow.startMessage}
            endMessage={flow.endMessage}
            selectedStepId={popupStepId || selectedStepId}
            onStepClick={(stepId) => {
              if (selectedStepId === stepId && !popupStepId) {
                // Second click on already-selected node — open editor
                setPopupStepId(stepId)
              } else {
                // First click — just highlight
                setSelectedStepId(stepId)
                setPopupStepId(null)
              }
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
            <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
              <div
                className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[80%] overflow-y-auto p-6 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-medium">
                    {popupStepId === '__start__'
                      ? 'Start Screen'
                      : popupStepId === '__end__'
                        ? 'End Screen'
                        : 'Step Editor'}
                  </div>
                  <button
                    onClick={() => setPopupStepId(null)}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                  >
                    &times;
                  </button>
                </div>

                {popupStepId === '__start__' ? (
                  renderStartEditor()
                ) : popupStepId === '__end__' ? (
                  renderEndEditor()
                ) : popupStep ? (
                  <StepEditorPanel
                    step={popupStep}
                    allSteps={flow.steps}
                    videos={videos}
                    onUpdateStep={updateStep}
                    onDeleteStep={(id) => {
                      deleteStep(id)
                      setPopupStepId(null)
                    }}
                    onAddOption={addOption}
                    onUpdateOption={updateOption}
                    onDeleteOption={deleteOption}
                    onVideoUploaded={(video) => {
                      setVideos((prev) => [video, ...prev])
                      fetchFlow()
                    }}
                  />
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
    </div>
  )
}
