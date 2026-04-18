/**
 * Training editor — three-pane layout per Design/SPEC-training-editor.md.
 *
 *   ┌─ TopNav (global, in dashboard/layout.tsx) ───┐
 *   ├─ Subnav: breadcrumb + badge + Preview/Publish ┤
 *   ├─ Sections ─┬─ Content editor ─┬─ Settings ────┤
 *   │  300px     │  flex 1          │  340px        │
 *
 * All CRUD endpoints from the previous editor are preserved verbatim. This
 * pass is presentational + UX: 3-pane layout, sticky subnav, inline rename,
 * drag-reorder sections, pre-flight publish drawer, autosave indicator.
 *
 * What we intentionally keep from the existing data model:
 *   - Section.contents[] where each content has type 'video' | 'text' and
 *     optional videoId. We present the FIRST video content as "the section's
 *     video" and the FIRST text content as "the section's description".
 *     Existing multi-content sections keep working — additional contents are
 *     just not editable from this screen (edit them from the old flow, or
 *     we can migrate later).
 *   - Quiz model + endpoints unchanged.
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { uploadVideoFile } from '@/lib/upload-client'
import { Badge, Button, Eyebrow, type BadgeTone } from '@/components/design'

// ───────────────────────── Types (mirrors existing API shape) ─────────────────────────

interface Video { id: string; filename: string; url: string; displayName?: string | null; durationSeconds?: number | null }
interface Content { id: string; type: string; sortOrder: number; videoId: string | null; video: Video | null; requiredWatch: boolean; autoplayNext: boolean; textContent: string | null }
interface Question { id: string; questionText: string; questionType: string; sortOrder: number; options: Array<{ text: string; isCorrect: boolean; hint?: string }> }
interface Quiz { id: string; title: string; requiredPassing: boolean; passingGrade: number; questions: Question[] }
interface Section {
  id: string
  title: string
  kind: 'video' | 'quiz'
  sortOrder: number
  contents: Content[]
  quiz: Quiz | null
}
interface Training {
  id: string
  title: string
  slug: string
  description: string | null
  coverImage: string | null
  isPublished: boolean
  passingGrade: number
  sectionOrder: 'sequential' | 'any'
  sections: Section[]
}

// ───────────────────────── Helpers ─────────────────────────

const fmtDuration = (s?: number | null): string => {
  if (!s || !isFinite(s)) return '—'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const videoContent = (sec: Section): Content | null =>
  sec.contents.find((c) => c.type === 'video') ?? null
const textContent = (sec: Section): Content | null =>
  sec.contents.find((c) => c.type === 'text') ?? null

// ───────────────────────── Main component ─────────────────────────

export default function TrainingEditorPage() {
  const params = useParams()
  const trainingId = params.id as string

  const [training, setTraining] = useState<Training | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'section' | 'course'>('section')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [showPublishDrawer, setShowPublishDrawer] = useState(false)

  // Drag state
  const [dragSectionId, setDragSectionId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: 'above' | 'below' } | null>(null)

  // Local edit buffers (debounced saves)
  const titleBufferRef = useRef<Record<string, string>>({})
  const descBufferRef = useRef<Record<string, string>>({})
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({})

  // Flash the saved chip
  const flashSaved = useCallback(() => {
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt((t) => (t && Date.now() - t >= 900 ? null : t)), 1000)
  }, [])

  // ─────── Data loading ───────

  const loadAll = useCallback(async () => {
    const [t, v] = await Promise.all([
      fetch(`/api/trainings/${trainingId}`).then((r) => r.json()),
      fetch('/api/videos?kind=training').then((r) => r.json()),
    ])
    setTraining(t)
    setVideos(
      (v as Array<Record<string, unknown>>).map((vid) => ({
        id: vid.id as string,
        filename: vid.filename as string,
        url: (vid.url as string) || (vid.storageKey as string),
        displayName: (vid.displayName as string | null) ?? null,
        durationSeconds: (vid.durationSeconds as number | null) ?? null,
      })),
    )
    if (!activeSectionId && t.sections?.length > 0) setActiveSectionId(t.sections[0].id)
    setLoading(false)
  }, [trainingId, activeSectionId])

  useEffect(() => { loadAll() }, [loadAll])

  // Prevent browser from opening dropped files in a new tab (capture phase)
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-dropzone]')) e.preventDefault()
    }
    window.addEventListener('dragover', prevent, true)
    window.addEventListener('drop', prevent, true)
    return () => {
      window.removeEventListener('dragover', prevent, true)
      window.removeEventListener('drop', prevent, true)
    }
  }, [])

  const refresh = async () => {
    const res = await fetch(`/api/trainings/${trainingId}`)
    if (res.ok) setTraining(await res.json())
  }

  // ─────── CRUD wrappers ───────

  const patchTraining = async (data: Partial<Training>) => {
    await fetch(`/api/trainings/${trainingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    flashSaved()
    refresh()
  }

  const addSection = async (kind: 'video' | 'quiz' = 'video') => {
    const res = await fetch(`/api/trainings/${trainingId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, title: kind === 'quiz' ? 'New quiz' : 'New section' }),
    })
    if (res.ok) {
      const created = await res.json().catch(() => null)
      await refresh()
      if (created?.id) setActiveSectionId(created.id)
      flashSaved()
    }
  }

  const patchSection = async (sectionId: string, data: Record<string, unknown>) => {
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    flashSaved()
    refresh()
  }

  const reorderSections = async (orderedIds: string[]) => {
    // Optimistic
    setTraining((prev) =>
      prev
        ? {
            ...prev,
            sections: orderedIds
              .map((id, idx) => {
                const s = prev.sections.find((x) => x.id === id)
                return s ? { ...s, sortOrder: idx } : null
              })
              .filter((x): x is Section => x !== null),
          }
        : prev,
    )
    await Promise.all(
      orderedIds.map((id, idx) =>
        fetch(`/api/trainings/${trainingId}/sections/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: idx }),
        }),
      ),
    )
    flashSaved()
  }

  const removeSection = async (sectionId: string) => {
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}`, { method: 'DELETE' })
    if (activeSectionId === sectionId) setActiveSectionId(null)
    flashSaved()
    refresh()
  }

  const upsertContent = async (sectionId: string, data: { type: 'video' | 'text'; videoId?: string | null; textContent?: string | null; requiredWatch?: boolean }) => {
    const existing = training?.sections.find((s) => s.id === sectionId)?.contents.find((c) => c.type === data.type)
    if (existing) {
      await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/contents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId: existing.id, ...data }),
      })
    } else {
      await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/contents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    }
    flashSaved()
    refresh()
  }

  const removeVideoFromSection = async (sectionId: string) => {
    const vc = training?.sections.find((s) => s.id === sectionId)?.contents.find((c) => c.type === 'video')
    if (!vc) return
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/contents`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentId: vc.id }),
    })
    flashSaved()
    refresh()
  }

  // Debounced text saves
  const debouncedSaveDescription = (sectionId: string, text: string) => {
    descBufferRef.current[sectionId] = text
    if (debounceTimers.current[`d-${sectionId}`]) clearTimeout(debounceTimers.current[`d-${sectionId}`])
    debounceTimers.current[`d-${sectionId}`] = setTimeout(() => {
      upsertContent(sectionId, { type: 'text', textContent: descBufferRef.current[sectionId] })
    }, 500)
  }

  const debouncedSaveTitle = (sectionId: string, title: string) => {
    titleBufferRef.current[sectionId] = title
    if (debounceTimers.current[`t-${sectionId}`]) clearTimeout(debounceTimers.current[`t-${sectionId}`])
    debounceTimers.current[`t-${sectionId}`] = setTimeout(() => {
      patchSection(sectionId, { title: titleBufferRef.current[sectionId] })
    }, 500)
  }

  // Video upload + attach to section
  const uploadAndAttach = async (sectionId: string, file: File, onProgress: (p: number) => void) => {
    if (!file.type.startsWith('video/')) {
      alert('Please upload a video file (MP4, MOV, WebM)')
      return
    }
    const result = await uploadVideoFile(file, onProgress, 'training')
    if (result.id) {
      setVideos((prev) => [
        { id: result.id!, filename: result.filename, url: result.url, displayName: null, durationSeconds: null },
        ...prev,
      ])
      await upsertContent(sectionId, { type: 'video', videoId: result.id })
    }
  }

  // Quiz
  const createQuiz = async (sectionId: string) => {
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Section quiz', requiredPassing: true, passingGrade: 80 }),
    })
    flashSaved()
    refresh()
  }
  const quizAction = async (sectionId: string, data: Record<string, unknown>) => {
    await fetch(`/api/trainings/${trainingId}/sections/${sectionId}/quiz`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    flashSaved()
    refresh()
  }

  // ─────── Keyboard shortcuts ───────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 's') {
        e.preventDefault()
        flashSaved()
        return
      }
      if (meta && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (!training || training.sections.length === 0) return
        e.preventDefault()
        const idx = training.sections.findIndex((s) => s.id === activeSectionId)
        const next = e.key === 'ArrowUp' ? Math.max(0, idx - 1) : Math.min(training.sections.length - 1, idx + 1)
        setActiveSectionId(training.sections[next].id)
        setViewMode('section')
      }
      if (e.key === 'Escape' && viewMode === 'section') {
        setViewMode('course')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [training, activeSectionId, viewMode, flashSaved])

  // ─────── Loading state ───────

  if (loading || !training) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-mono text-[11px] uppercase text-grey-35" style={{ letterSpacing: '0.1em' }}>Loading editor…</div>
      </div>
    )
  }

  const activeSection = training.sections.find((s) => s.id === activeSectionId) ?? null
  const preflight = computePreflight(training)

  return (
    // The dashboard layout wraps children in a max-width container with
    // px + py. Negate those so the editor goes full-bleed and we can manage
    // our own scroll regions.
    <div className="-mx-6 lg:-mx-[132px] -my-8 flex flex-col" style={{ height: 'calc(100vh - 60px)', background: 'var(--bg)' }}>
      {/* ─────── Subnav ─────── */}
      <div className="shrink-0 bg-white border-b border-surface-border">
        <div className="px-6 py-3.5 flex items-center gap-3">
          <Link href="/dashboard/trainings" className="text-[13px] text-grey-35 hover:text-ink">
            Trainings <span className="text-grey-50 mx-1">/</span>
          </Link>
          <div className="text-[15px] font-semibold text-ink">{training.title}</div>
          <Badge tone={training.isPublished ? 'success' : 'brand'}>
            {training.isPublished ? 'Published' : 'Draft'}
          </Badge>
          <div className="ml-auto flex items-center gap-2.5">
            {savedAt && (
              <div className="font-mono text-[10px] uppercase text-grey-35 transition-opacity" style={{ letterSpacing: '0.12em' }}>
                Saved
              </div>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(`/t/${training.slug}?preview=1`, '_blank')}
            >
              Preview
            </Button>
            <Button
              size="sm"
              onClick={() => setShowPublishDrawer(true)}
            >
              {training.isPublished ? 'Update' : 'Publish'}
            </Button>
          </div>
        </div>
      </div>

      {/* ─────── 3-pane body ─────── */}
      <div className="flex-1 flex min-h-0">
        {/* ───── Left: Sections ───── */}
        <aside className="w-[300px] shrink-0 bg-white border-r border-surface-border overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-2.5">
              <Eyebrow size="xs">Sections · {training.sections.length}</Eyebrow>
              <button
                onClick={() => { setViewMode('course'); setActiveSectionId(null) }}
                className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full transition-colors ${
                  viewMode === 'course' ? 'bg-brand-50 text-[color:var(--brand-fg)]' : 'text-grey-35 hover:bg-surface-light'
                }`}
                style={{ letterSpacing: '0.12em' }}
                title="Course settings"
              >
                Course
              </button>
            </div>

            {training.sections.length === 0 ? (
              <div className="text-center py-10 px-2">
                <div className="text-[13px] font-medium text-ink mb-1.5">Your course is empty</div>
                <p className="text-[12px] text-grey-35 mb-4">Add your first section to get started.</p>
                <div className="flex flex-col gap-2">
                  <Button size="sm" onClick={() => addSection('video')}>+ Video section</Button>
                  <Button size="sm" variant="secondary" onClick={() => addSection('quiz')}>+ Quiz section</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {training.sections.map((s, idx) => {
                  const isActive = viewMode === 'section' && activeSectionId === s.id
                  const vc = videoContent(s)
                  const subtitle = s.kind === 'quiz'
                    ? `Quiz · ${s.quiz?.questions.length ?? 0} Q`
                    : fmtDuration(vc?.video?.durationSeconds ?? null)
                  const isDropTargetAbove = dropTarget?.id === s.id && dropTarget.edge === 'above'
                  const isDropTargetBelow = dropTarget?.id === s.id && dropTarget.edge === 'below'
                  return (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        setDragSectionId(s.id)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', s.id)
                      }}
                      onDragOver={(e) => {
                        if (!dragSectionId || dragSectionId === s.id) return
                        e.preventDefault()
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                        const edge: 'above' | 'below' = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
                        setDropTarget({ id: s.id, edge })
                      }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => {
                        e.preventDefault()
                        const src = dragSectionId
                        setDragSectionId(null)
                        setDropTarget(null)
                        if (!src || src === s.id) return
                        const currentOrder = training.sections.map((x) => x.id)
                        const filtered = currentOrder.filter((id) => id !== src)
                        let target = filtered.indexOf(s.id)
                        if (dropTarget?.edge === 'below') target += 1
                        filtered.splice(target, 0, src)
                        reorderSections(filtered)
                      }}
                      onDragEnd={() => { setDragSectionId(null); setDropTarget(null) }}
                      onClick={() => { setActiveSectionId(s.id); setViewMode('section') }}
                      className={`group relative rounded-[8px] px-3 py-2.5 cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-brand-50 border-[color:var(--brand-primary)]'
                          : 'bg-transparent border-transparent hover:bg-surface-weak'
                      }`}
                      style={{ opacity: dragSectionId === s.id ? 0.4 : 1 }}
                    >
                      {isDropTargetAbove && <div className="absolute -top-0.5 left-0 right-0 h-[2px]" style={{ background: 'var(--brand-primary)' }} />}
                      {isDropTargetBelow && <div className="absolute -bottom-0.5 left-0 right-0 h-[2px]" style={{ background: 'var(--brand-primary)' }} />}
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-[22px] h-[22px] rounded-full shrink-0 flex items-center justify-center font-mono text-[11px] font-semibold"
                          style={{
                            background: isActive ? 'var(--brand-primary)' : '#F1EBE1',
                            color: isActive ? '#fff' : '#59595A',
                          }}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-ink truncate">{s.title}</div>
                          <div className="font-mono text-[11px] text-grey-35 truncate" style={{ letterSpacing: '0.02em' }}>{subtitle}</div>
                        </div>
                        {/* Drag handle — visible on hover */}
                        <svg
                          width={14}
                          height={14}
                          viewBox="0 0 14 14"
                          className="opacity-0 group-hover:opacity-100 text-grey-50"
                          style={{ cursor: dragSectionId === s.id ? 'grabbing' : 'grab' }}
                          aria-hidden
                        >
                          <circle cx={4} cy={3} r={1.1} fill="currentColor" />
                          <circle cx={4} cy={7} r={1.1} fill="currentColor" />
                          <circle cx={4} cy={11} r={1.1} fill="currentColor" />
                          <circle cx={10} cy={3} r={1.1} fill="currentColor" />
                          <circle cx={10} cy={7} r={1.1} fill="currentColor" />
                          <circle cx={10} cy={11} r={1.1} fill="currentColor" />
                        </svg>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {training.sections.length > 0 && (
              <div className="mt-3 flex gap-1.5">
                <button
                  onClick={() => addSection('video')}
                  className="flex-1 px-2.5 py-2 rounded-[8px] text-[12px] font-medium text-grey-35 hover:text-ink hover:bg-surface-weak transition-colors text-left"
                >
                  + Video
                </button>
                <button
                  onClick={() => addSection('quiz')}
                  className="flex-1 px-2.5 py-2 rounded-[8px] text-[12px] font-medium text-grey-35 hover:text-ink hover:bg-surface-weak transition-colors text-left"
                >
                  + Quiz
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ───── Middle: Content editor ───── */}
        <section className="flex-1 min-w-0 overflow-y-auto" style={{ background: 'var(--bg)' }}>
          {viewMode === 'course' || !activeSection ? (
            <CourseSettingsPane
              training={training}
              onUpdate={patchTraining}
              onChooseSection={(id) => { setActiveSectionId(id); setViewMode('section') }}
            />
          ) : activeSection.kind === 'quiz' ? (
            <QuizSectionEditorPane
              key={activeSection.id}
              section={activeSection}
              sectionNumber={training.sections.findIndex((s) => s.id === activeSection.id) + 1}
              onRenameSection={(title) => debouncedSaveTitle(activeSection.id, title)}
              onCreateQuiz={() => createQuiz(activeSection.id)}
              onQuizAction={(data) => quizAction(activeSection.id, data)}
            />
          ) : (
            <SectionEditorPane
              key={activeSection.id}
              section={activeSection}
              sectionNumber={training.sections.findIndex((s) => s.id === activeSection.id) + 1}
              onRenameSection={(title) => debouncedSaveTitle(activeSection.id, title)}
              onDescriptionChange={(text) => debouncedSaveDescription(activeSection.id, text)}
              onUploadVideo={(file, onProgress) => uploadAndAttach(activeSection.id, file, onProgress)}
              onRemoveVideo={() => removeVideoFromSection(activeSection.id)}
            />
          )}
        </section>

        {/* ───── Right: Settings ───── */}
        <aside className="w-[340px] shrink-0 bg-white border-l border-surface-border overflow-y-auto">
          {viewMode === 'section' && activeSection ? (
            <SectionSettingsPane
              section={activeSection}
              videos={videos}
              onAttachVideo={(videoId) => upsertContent(activeSection.id, { type: 'video', videoId })}
              onSetRequiredWatch={(req) => upsertContent(activeSection.id, { type: 'video', requiredWatch: req })}
              onSetQuizPassingGrade={(grade) => quizAction(activeSection.id, { passingGrade: grade })}
              onDeleteSection={async () => {
                if (!confirm(`Delete section ${training.sections.findIndex((s) => s.id === activeSection.id) + 1}?`)) return
                await removeSection(activeSection.id)
              }}
            />
          ) : (
            <CourseSettingsRightPane training={training} onUpdate={patchTraining} />
          )}
        </aside>
      </div>

      {/* ─────── Publish pre-flight drawer ─────── */}
      {showPublishDrawer && (
        <PublishDrawer
          training={training}
          preflight={preflight}
          onClose={() => setShowPublishDrawer(false)}
          onPublish={async () => {
            await patchTraining({ isPublished: true })
            setShowPublishDrawer(false)
          }}
        />
      )}
    </div>
  )
}

// ───────────────────────── Middle pane — Course settings ─────────────────────────

function CourseSettingsPane({
  training,
  onUpdate,
  onChooseSection,
}: {
  training: Training
  onUpdate: (data: Partial<Training>) => void
  onChooseSection: (id: string) => void
}) {
  return (
    <div className="p-8 lg:p-10 max-w-[720px]">
      <Eyebrow size="xs" className="mb-1.5">Course</Eyebrow>
      <h2 className="text-[24px] font-semibold text-ink tracking-tight2 mb-6">{training.title}</h2>

      <p className="text-[13px] text-grey-35 mb-6 leading-relaxed max-w-[580px]">
        Course-level settings live in the right pane. Pick a section to the left to edit its video, description, and quiz — or add a new one.
      </p>

      {training.sections.length > 0 && (
        <div className="mb-8">
          <div className="eyebrow mb-2">Quick jump</div>
          <div className="space-y-2">
            {training.sections.map((s, i) => (
              <button
                key={s.id}
                onClick={() => onChooseSection(s.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] border border-surface-border bg-white hover:bg-surface-weak text-left transition-colors"
              >
                <div className="w-[22px] h-[22px] rounded-full font-mono text-[11px] font-semibold flex items-center justify-center text-grey-35" style={{ background: '#F1EBE1' }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-ink truncate">{s.title}</div>
                  <div className="font-mono text-[11px] text-grey-35 truncate">
                    {s.kind === 'quiz'
                      ? `Quiz · ${s.quiz?.questions.length ?? 0} Q`
                      : fmtDuration(videoContent(s)?.video?.durationSeconds ?? null)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <label className="block">
          <div className="eyebrow mb-1.5">Title</div>
          <input
            type="text"
            defaultValue={training.title}
            onBlur={(e) => { if (e.target.value !== training.title) onUpdate({ title: e.target.value }) }}
            className="w-full px-3 py-2.5 border border-surface-border rounded-[10px] text-ink text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </label>
        <label className="block">
          <div className="eyebrow mb-1.5">Description</div>
          <textarea
            defaultValue={training.description || ''}
            rows={4}
            onBlur={(e) => { if (e.target.value !== (training.description || '')) onUpdate({ description: e.target.value }) }}
            className="w-full px-3 py-2.5 border border-surface-border rounded-[10px] text-ink text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            placeholder="Short description of the course…"
          />
        </label>
      </div>
    </div>
  )
}

// ───────────────────────── Middle pane — Section editor ─────────────────────────

function SectionEditorPane({
  section,
  sectionNumber,
  onRenameSection,
  onDescriptionChange,
  onUploadVideo,
  onRemoveVideo,
}: {
  section: Section
  sectionNumber: number
  onRenameSection: (title: string) => void
  onDescriptionChange: (text: string) => void
  onUploadVideo: (file: File, onProgress: (p: number) => void) => Promise<void>
  onRemoveVideo: () => void
}) {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const vc = videoContent(section)
  const tc = textContent(section)
  const duration = fmtDuration(vc?.video?.durationSeconds ?? null)

  const pickFile = () => fileRef.current?.click()
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadProgress(0)
    await onUploadVideo(file, (p) => setUploadProgress(p))
    setUploadProgress(null)
    if (fileRef.current) fileRef.current.value = ''
  }
  const onDropVideo = async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    setUploadProgress(0)
    await onUploadVideo(file, (p) => setUploadProgress(p))
    setUploadProgress(null)
  }

  return (
    <div className="p-8 lg:p-10 max-w-[720px] mx-auto">
      <Eyebrow size="xs" className="mb-1">
        Section {sectionNumber} · {duration}
      </Eyebrow>

      <InlineEditableHeading
        value={section.title}
        onChange={onRenameSection}
      />

      {/* ─── Video block ─── */}
      <div className="mb-6">
        {vc?.video ? (
          <div className="relative rounded-[14px] overflow-hidden border border-surface-border bg-[#1a1815] aspect-video">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={vc.video.url}
              controls
              className="w-full h-full object-contain bg-black"
              preload="metadata"
            />
          </div>
        ) : (
          <div
            data-dropzone
            onClick={pickFile}
            onDragOver={(e) => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--brand-primary)' }}
            onDragLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}
            onDrop={onDropVideo}
            className="aspect-video rounded-[14px] border-2 border-dashed cursor-pointer flex flex-col items-center justify-center text-center px-6 transition-colors"
            style={{ borderColor: 'var(--border)', background: '#fff' }}
          >
            {uploadProgress !== null ? (
              <>
                <div className="w-10 h-10 rounded-full border-2 border-brand-200 border-t-[color:var(--brand-primary)] animate-spin mb-3" />
                <div className="font-mono text-[11px] uppercase text-grey-35" style={{ letterSpacing: '0.1em' }}>
                  Uploading · {uploadProgress}%
                </div>
              </>
            ) : (
              <>
                <svg className="w-8 h-8 text-grey-50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <div className="text-[14px] text-ink font-medium mb-1">Drop a video here or click to browse</div>
                <div className="font-mono text-[11px] uppercase text-grey-50" style={{ letterSpacing: '0.1em' }}>
                  MP4, MOV, WEBM · up to 500MB
                </div>
              </>
            )}
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFile} />
          </div>
        )}

        {vc?.video && (
          <div className="mt-3 flex items-center gap-2.5">
            <label>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-surface-border rounded-[10px] text-[12px] font-medium text-ink bg-white hover:bg-surface-light cursor-pointer">
                Replace video
              </span>
              <input type="file" accept="video/*" className="hidden" onChange={onFile} />
            </label>
            <button
              onClick={onRemoveVideo}
              className="text-[12px] font-medium px-3 py-1.5 rounded-[10px] hover:bg-[color:var(--danger-bg)] transition-colors"
              style={{ color: 'var(--danger-fg)' }}
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {/* ─── Description block ─── */}
      <div className="mb-8">
        <div className="eyebrow mb-1.5">Description</div>
        <textarea
          key={section.id /* reset when switching sections */}
          defaultValue={tc?.textContent || ''}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={6}
          className="w-full px-3.5 py-3 border border-surface-border rounded-[10px] text-ink text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          placeholder="What will candidates learn in this section?"
        />
      </div>

    </div>
  )
}

function QuizSectionEditorPane({
  section,
  sectionNumber,
  onRenameSection,
  onCreateQuiz,
  onQuizAction,
}: {
  section: Section
  sectionNumber: number
  onRenameSection: (title: string) => void
  onCreateQuiz: () => void
  onQuizAction: (data: Record<string, unknown>) => void
}) {
  return (
    <div className="p-8 lg:p-10 max-w-[720px] mx-auto">
      <Eyebrow size="xs" className="mb-1">
        Section {sectionNumber} · Quiz
      </Eyebrow>
      <InlineEditableHeading value={section.title} onChange={onRenameSection} />
      {section.quiz ? (
        <QuizBlock quiz={section.quiz} onQuizAction={onQuizAction} />
      ) : (
        <button
          onClick={onCreateQuiz}
          className="w-full text-left p-4 rounded-[14px] border border-dashed border-surface-border hover:border-[color:var(--brand-primary)] hover:bg-brand-50/40 transition-colors"
        >
          <div className="text-[14px] font-medium text-ink">+ Create quiz</div>
          <div className="text-[12px] text-grey-35 mt-0.5">Add questions candidates must pass to complete this section.</div>
        </button>
      )}
    </div>
  )
}

// ───────────────────────── Inline heading ─────────────────────────

function InlineEditableHeading({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  if (editing) {
    return (
      <input
        autoFocus
        value={local}
        onChange={(e) => { setLocal(e.target.value); onChange(e.target.value) }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur() }
          if (e.key === 'Escape') { setLocal(value); setEditing(false) }
        }}
        className="w-full text-[24px] font-semibold text-ink tracking-tight2 mb-5 bg-transparent border-b border-surface-border focus:outline-none focus:border-[color:var(--brand-primary)]"
      />
    )
  }
  return (
    <h2
      className="text-[24px] font-semibold text-ink tracking-tight2 mb-5 cursor-text hover:bg-surface-weak rounded-[6px] -mx-1 px-1 transition-colors"
      onClick={() => setEditing(true)}
      title="Click to rename"
    >
      {value}
    </h2>
  )
}

// ───────────────────────── Quiz block ─────────────────────────

function QuizBlock({
  quiz,
  onQuizAction,
}: {
  quiz: Quiz
  onQuizAction: (data: Record<string, unknown>) => void
}) {
  return (
    <div className="bg-white border border-surface-border rounded-[14px] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Eyebrow size="xs" className="mb-0.5">Questions</Eyebrow>
          <div className="text-[14px] font-semibold text-ink">
            {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'}
          </div>
        </div>
        <button
          onClick={() => onQuizAction({ action: 'add_question', questionText: 'New question', questionType: 'single', options: [{ text: 'Option A', isCorrect: true }, { text: 'Option B', isCorrect: false }] })}
          className="text-[12px] font-medium text-grey-35 hover:text-ink"
        >
          + Add question
        </button>
      </div>

      {quiz.questions.length === 0 ? (
        <div className="text-center py-6 text-[13px] text-grey-35">
          No questions yet. Add one to complete this quiz section.
        </div>
      ) : (
        <div className="space-y-4">
          {quiz.questions.map((q, i) => (
            <div key={q.id} className="pb-4 border-b border-surface-divider last:border-0 last:pb-0">
              <div className="flex items-start gap-2 mb-2">
                <div className="font-mono text-[11px] text-grey-50 pt-2 w-6" style={{ letterSpacing: '0.08em' }}>Q{i + 1}</div>
                <input
                  defaultValue={q.questionText}
                  onBlur={(e) => { if (e.target.value !== q.questionText) onQuizAction({ action: 'update_question', questionId: q.id, questionText: e.target.value }) }}
                  className="flex-1 px-3 py-1.5 bg-transparent border-b border-surface-border text-[14px] text-ink focus:outline-none focus:border-[color:var(--brand-primary)]"
                />
                <button
                  onClick={() => onQuizAction({ action: 'delete_question', questionId: q.id })}
                  className="text-grey-50 hover:text-[color:var(--danger-fg)] text-[18px] px-2"
                  title="Delete question"
                >
                  ×
                </button>
              </div>
              <div className="ml-8 space-y-1.5">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      type={q.questionType === 'multiselect' ? 'checkbox' : 'radio'}
                      checked={opt.isCorrect}
                      onChange={() => {
                        const next = q.options.map((o, j) => ({
                          ...o,
                          isCorrect: q.questionType === 'multiselect'
                            ? (j === oi ? !o.isCorrect : o.isCorrect)
                            : (j === oi),
                        }))
                        onQuizAction({ action: 'update_question', questionId: q.id, options: next })
                      }}
                      className="accent-[color:var(--brand-primary)]"
                    />
                    <input
                      defaultValue={opt.text}
                      onBlur={(e) => {
                        if (e.target.value === opt.text) return
                        const next = q.options.map((o, j) => (j === oi ? { ...o, text: e.target.value } : o))
                        onQuizAction({ action: 'update_question', questionId: q.id, options: next })
                      }}
                      className="flex-1 px-2 py-1 text-[13px] text-ink bg-transparent border-b border-surface-border focus:outline-none focus:border-[color:var(--brand-primary)]"
                    />
                    <button
                      onClick={() => {
                        const next = q.options.filter((_, j) => j !== oi)
                        onQuizAction({ action: 'update_question', questionId: q.id, options: next })
                      }}
                      className="text-grey-50 hover:text-[color:var(--danger-fg)] text-[14px] w-6"
                      title="Remove option"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const next = [...q.options, { text: `Option ${String.fromCharCode(65 + q.options.length)}`, isCorrect: false }]
                    onQuizAction({ action: 'update_question', questionId: q.id, options: next })
                  }}
                  className="text-[11px] font-mono uppercase text-grey-35 hover:text-ink"
                  style={{ letterSpacing: '0.08em' }}
                >
                  + Add option
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Right pane — Section settings ─────────────────────────

function SectionSettingsPane({
  section,
  videos,
  onAttachVideo,
  onSetRequiredWatch,
  onSetQuizPassingGrade,
  onDeleteSection,
}: {
  section: Section
  videos: Video[]
  onAttachVideo: (videoId: string) => void
  onSetRequiredWatch: (required: boolean) => void
  onSetQuizPassingGrade: (grade: number) => void
  onDeleteSection: () => void
}) {
  const vc = videoContent(section)
  const isQuiz = section.kind === 'quiz'

  return (
    <div className="p-5">
      <Eyebrow size="xs" className="mb-3">
        {isQuiz ? 'Quiz section' : 'Video section'}
      </Eyebrow>

      {isQuiz ? (
        <>
          <Field label="Passing grade">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={section.quiz?.passingGrade ?? 80}
                onBlur={(e) => {
                  const n = Number(e.target.value)
                  if (section.quiz && n !== section.quiz.passingGrade) onSetQuizPassingGrade(n)
                }}
                className="w-20 px-2.5 py-1.5 border border-surface-border rounded-[10px] text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                disabled={!section.quiz}
              />
              <span className="font-mono text-[11px] text-grey-50">%</span>
            </div>
          </Field>
          <Field label="Questions">
            <div className="font-mono text-[13px] text-ink">
              {section.quiz?.questions.length ?? 0}
            </div>
            {!section.quiz?.questions.length && (
              <div className="mt-1.5 font-mono text-[10px] uppercase text-grey-50" style={{ letterSpacing: '0.08em' }}>
                Add ≥1 question to publish
              </div>
            )}
          </Field>
        </>
      ) : (
        <>
          <Field label="Video source">
            <select
              value={vc?.videoId || ''}
              onChange={(e) => e.target.value && onAttachVideo(e.target.value)}
              className="w-full px-3 py-2 border border-surface-border rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="">None attached</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.displayName || v.filename}
                  {v.durationSeconds ? ` · ${fmtDuration(v.durationSeconds)}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Watch full video">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <button
                type="button"
                onClick={() => onSetRequiredWatch(!(vc?.requiredWatch ?? true))}
                disabled={!vc}
                className="w-10 h-5 rounded-full transition-colors relative disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: (vc?.requiredWatch ?? true) ? 'var(--brand-primary)' : '#D1CFCA' }}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${(vc?.requiredWatch ?? true) ? 'left-5' : 'left-0.5'}`} />
              </button>
              <span className="text-[13px] text-ink">
                {(vc?.requiredWatch ?? true) ? 'Required' : 'Optional'}
              </span>
            </label>
            <div className="mt-1.5 font-mono text-[10px] uppercase text-grey-50" style={{ letterSpacing: '0.08em' }}>
              {(vc?.requiredWatch ?? true)
                ? 'Candidate must finish the video before continuing'
                : 'Candidate can skip the video'}
            </div>
          </Field>
          <Field label="Estimated duration">
            <div className="font-mono text-[13px] text-ink">
              {fmtDuration(vc?.video?.durationSeconds ?? null)}
            </div>
          </Field>
        </>
      )}

      <div className="mt-6 mb-3"><Eyebrow size="xs">Enrollment</Eyebrow></div>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Enrolled" value="—" />
        <MiniStat label="Completed" value="—" />
        <MiniStat label="Avg. time" value="—" />
        {isQuiz && <MiniStat label="Quiz pass rate" value="—" />}
      </div>

      <div className="mt-6 pt-5 border-t border-surface-divider">
        <button
          onClick={onDeleteSection}
          className="w-full text-[12px] font-medium py-2 rounded-[10px] hover:bg-[color:var(--danger-bg)] transition-colors"
          style={{ color: 'var(--danger-fg)' }}
        >
          Delete section
        </button>
      </div>
    </div>
  )
}

// ───────────────────────── Right pane — Course settings ─────────────────────────

function CourseSettingsRightPane({
  training,
  onUpdate,
}: {
  training: Training
  onUpdate: (data: Partial<Training>) => void
}) {
  const coverRef = useRef<HTMLInputElement>(null)
  const [uploadingCover, setUploadingCover] = useState(false)

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads/logo', { method: 'POST', body: formData })
      if (res.ok) {
        const { url } = await res.json()
        onUpdate({ coverImage: url })
      }
    } finally {
      setUploadingCover(false)
      if (coverRef.current) coverRef.current.value = ''
    }
  }

  return (
    <div className="p-5">
      <Eyebrow size="xs" className="mb-3">Course settings</Eyebrow>

      <Field label="Cover image">
        {training.coverImage ? (
          <div className="relative rounded-[10px] overflow-hidden border border-surface-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={training.coverImage} alt="Cover" className="w-full h-28 object-cover" />
            <button
              onClick={() => onUpdate({ coverImage: null })}
              className="absolute top-2 right-2 w-6 h-6 bg-black/50 text-white rounded-full text-xs"
            >
              ×
            </button>
          </div>
        ) : (
          <label className="block w-full h-24 border-2 border-dashed border-surface-border rounded-[10px] cursor-pointer hover:border-[color:var(--brand-primary)] transition-colors flex items-center justify-center">
            <span className="text-[11px] text-grey-35">{uploadingCover ? 'Uploading…' : 'Upload image'}</span>
            <input ref={coverRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={uploadingCover} />
          </label>
        )}
      </Field>

      <Field label="Public slug">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-grey-50">/t/</span>
          <input
            type="text"
            defaultValue={training.slug}
            onBlur={(e) => { if (e.target.value !== training.slug) onUpdate({ slug: e.target.value } as Partial<Training>) }}
            className="flex-1 px-2.5 py-1.5 border border-surface-border rounded-[10px] text-[13px] text-ink font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
      </Field>

      <Field label="Passing grade">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={training.passingGrade}
            onBlur={(e) => {
              const n = Number(e.target.value)
              if (n !== training.passingGrade) onUpdate({ passingGrade: n } as Partial<Training>)
            }}
            className="w-20 px-2.5 py-1.5 border border-surface-border rounded-[10px] text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <span className="font-mono text-[11px] text-grey-50">%</span>
        </div>
      </Field>

      <Field label="Section order">
        <div className="inline-flex w-full rounded-[10px] bg-surface-weak p-0.5">
          {([
            { v: 'sequential' as const, l: 'Sequential' },
            { v: 'any' as const, l: 'Any order' },
          ]).map((o) => (
            <button
              key={o.v}
              onClick={() => onUpdate({ sectionOrder: o.v } as Partial<Training>)}
              className={`flex-1 px-2 py-1.5 text-[12px] font-medium rounded-[8px] transition-colors ${
                training.sectionOrder === o.v ? 'bg-white text-ink shadow-sm' : 'text-grey-35 hover:text-ink'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <div className="mt-1.5 font-mono text-[10px] uppercase text-grey-50" style={{ letterSpacing: '0.08em' }}>
          {training.sectionOrder === 'sequential'
            ? 'Candidates finish each section before unlocking the next'
            : 'Candidates can start any section in any order'}
        </div>
      </Field>

      <Field label="Status">
        <Badge tone={training.isPublished ? 'success' : 'brand'}>
          {training.isPublished ? 'Published' : 'Draft'}
        </Badge>
      </Field>
    </div>
  )
}

// ───────────────────────── Small helpers ─────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <div className="font-mono text-[10px] uppercase text-grey-35 mb-1.5" style={{ letterSpacing: '0.1em' }}>
        {label}
      </div>
      {children}
    </label>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] p-2.5" style={{ background: '#F7F3EB' }}>
      <div className="font-mono text-[10px] uppercase text-grey-35" style={{ letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div className="text-[15px] font-semibold text-ink mt-0.5">{value}</div>
    </div>
  )
}

// ───────────────────────── Publish pre-flight ─────────────────────────

type PreflightCheck = { label: string; ok: boolean; blocking: boolean; sectionHint?: string }

function computePreflight(training: Training): PreflightCheck[] {
  const checks: PreflightCheck[] = []
  for (let i = 0; i < training.sections.length; i++) {
    const s = training.sections[i]
    if (s.kind === 'quiz') {
      const count = s.quiz?.questions.length ?? 0
      checks.push({
        label: `Section ${i + 1} quiz has ≥1 question`,
        ok: count >= 1,
        blocking: true,
        sectionHint: count >= 1 ? undefined : s.title,
      })
    } else {
      const hasVideo = !!videoContent(s)?.videoId
      checks.push({
        label: `Section ${i + 1} has a video`,
        ok: hasVideo,
        blocking: true,
        sectionHint: hasVideo ? undefined : s.title,
      })
    }
  }
  checks.push({ label: 'Cover image set', ok: !!training.coverImage, blocking: false })
  checks.push({ label: 'Public slug set', ok: !!training.slug, blocking: true })
  return checks
}

function PublishDrawer({
  training,
  preflight,
  onClose,
  onPublish,
}: {
  training: Training
  preflight: PreflightCheck[]
  onClose: () => void
  onPublish: () => Promise<void>
}) {
  const blocked = preflight.some((c) => c.blocking && !c.ok)
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-[14px] border border-surface-border w-full max-w-[480px] p-6"
        style={{ boxShadow: 'var(--shadow-raised)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Eyebrow size="xs" className="mb-1">Pre-flight</Eyebrow>
        <h3 className="text-[20px] font-semibold text-ink mb-4 tracking-tight2">
          {training.isPublished ? 'Update this training' : 'Publish this training'}
        </h3>

        <div className="space-y-2 mb-5">
          {preflight.map((c, i) => {
            const tone: BadgeTone = c.ok ? 'success' : c.blocking ? 'danger' : 'warn'
            return (
              <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-surface-divider last:border-0">
                <div className="text-[13px] text-ink">{c.label}</div>
                <Badge tone={tone}>{c.ok ? 'OK' : c.blocking ? 'Block' : 'Warn'}</Badge>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={blocked || busy}
            onClick={async () => { setBusy(true); await onPublish(); setBusy(false) }}
          >
            {busy ? 'Publishing…' : training.isPublished ? 'Update now' : 'Publish now'}
          </Button>
        </div>
      </div>
    </div>
  )
}
