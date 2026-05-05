'use client'

/**
 * CurrentActivityCard — at-a-glance "where is this candidate right now"
 * panel for recruiters. Surfaces three live signals derived from data
 * already on the candidate object:
 *   1. Application flow position (Step X of Y + the step's title)
 *   2. Training enrollment progress (sections complete, currently on)
 *   3. A heartbeat ("Last seen 4 min ago") from Session.lastActivityAt
 *
 * Interview state is intentionally not duplicated here — InterviewPanel
 * already renders that just below.
 */

import { useEffect, useState } from 'react'

interface LastStep {
  id: string
  title: string
  stepOrder: number
  stepType: string
  questionType: string
}

interface TrainingSection {
  id: string
  title: string
  sortOrder: number
  kind: string
}

interface TrainingEnrollment {
  id: string
  status: string
  startedAt: string
  completedAt: string | null
  progress: {
    completedSections?: string[]
    quizScores?: { sectionId: string; score: number }[]
    sectionTimestamps?: Record<string, string>
  } | null
  training: { id: string; title: string; sections?: TrainingSection[] }
}

interface CurrentActivityCardProps {
  startedAt: string
  finishedAt: string | null
  lastActivityAt: string | null
  outcome: string | null
  lastStep: LastStep | null
  flowStepCount: number
  answersCount: number
  trainingEnrollments: TrainingEnrollment[]
}

function relativeTime(iso: string | null): { text: string; tone: 'live' | 'recent' | 'idle' | 'stale' } {
  if (!iso) return { text: 'Never seen', tone: 'stale' }
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return { text: 'Active now', tone: 'live' }
  const min = Math.floor(sec / 60)
  if (min < 60) return { text: `Last active ${min} min ago`, tone: min < 5 ? 'live' : 'recent' }
  const hr = Math.floor(min / 60)
  if (hr < 24) return { text: `Last active ${hr}h ago`, tone: 'idle' }
  const day = Math.floor(hr / 24)
  if (day < 7) return { text: `Last active ${day}d ago`, tone: 'stale' }
  return { text: `Last active ${new Date(iso).toLocaleDateString()}`, tone: 'stale' }
}

function ProgressBar({ pct, tone = 'brand' }: { pct: number; tone?: 'brand' | 'green' | 'gray' }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const fill = tone === 'green' ? 'bg-green-500' : tone === 'gray' ? 'bg-gray-300' : 'bg-brand-500'
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${fill} transition-all`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function CurrentActivityCard({
  startedAt,
  finishedAt,
  lastActivityAt,
  outcome,
  lastStep,
  flowStepCount,
  answersCount,
  trainingEnrollments,
}: CurrentActivityCardProps) {
  // Re-tick the relative-time label every 30s so "Last active 4 min ago"
  // doesn't go stale while the recruiter is staring at the page.
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const heartbeat = relativeTime(lastActivityAt || startedAt)
  const dotClass =
    heartbeat.tone === 'live'
      ? 'bg-green-500 ring-2 ring-green-200 animate-pulse'
      : heartbeat.tone === 'recent'
      ? 'bg-green-400'
      : heartbeat.tone === 'idle'
      ? 'bg-amber-400'
      : 'bg-gray-300'

  // ── Flow status ────────────────────────────────────────────────────────
  // finishedAt set → flow done. Otherwise the step they're sitting on now
  // is `lastStep`; position is 1-indexed via stepOrder.
  const flowState: { kind: 'completed' | 'in_progress' | 'not_started' | 'no_flow'; pct: number; label: string; sub?: string } = (() => {
    if (flowStepCount === 0) return { kind: 'no_flow', pct: 0, label: 'No flow attached' }
    if (finishedAt) {
      const labelPart = outcome === 'passed' ? 'Passed' : outcome === 'failed' ? 'Failed' : 'Completed'
      return { kind: 'completed', pct: 100, label: `Flow ${labelPart.toLowerCase()}`, sub: `Finished ${new Date(finishedAt).toLocaleString()}` }
    }
    if (!lastStep) {
      // Edge case: session created but no lastStep — treat as not started.
      return { kind: 'not_started', pct: 0, label: 'Not started yet', sub: `${flowStepCount} step${flowStepCount === 1 ? '' : 's'} total` }
    }
    const pos = lastStep.stepOrder + 1
    const pct = Math.round((pos / Math.max(1, flowStepCount)) * 100)
    return {
      kind: 'in_progress',
      pct,
      label: `Step ${pos} of ${flowStepCount}`,
      sub: `Currently on: ${lastStep.title}${answersCount > 0 ? ` · ${answersCount} answer${answersCount === 1 ? '' : 's'} so far` : ''}`,
    }
  })()

  // ── Training rows ──────────────────────────────────────────────────────
  const trainingRows = trainingEnrollments.map((e) => {
    const sections = e.training.sections || []
    const completedIds = new Set(e.progress?.completedSections || [])
    const total = sections.length
    const done = sections.filter((s) => completedIds.has(s.id)).length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    const isCompleted = e.status === 'completed' || e.completedAt !== null
    const currentSection = isCompleted
      ? null
      : sections.find((s) => !completedIds.has(s.id)) || null
    return {
      id: e.id,
      title: e.training.title,
      isCompleted,
      done,
      total,
      pct,
      currentSection,
      completedAt: e.completedAt,
      startedAt: e.startedAt,
    }
  })

  return (
    <div className="bg-white rounded-[12px] border border-surface-border p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-grey-15">Current activity</h3>
        <div className="flex items-center gap-2 text-xs text-grey-40">
          <span className={`w-2 h-2 rounded-full ${dotClass}`} aria-hidden />
          <span>{heartbeat.text}</span>
        </div>
      </div>

      {/* Flow */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-grey-20 uppercase tracking-wide">Application flow</span>
          <span
            className={`text-xs font-medium ${
              flowState.kind === 'completed'
                ? outcome === 'failed'
                  ? 'text-red-600'
                  : 'text-green-700'
                : flowState.kind === 'in_progress'
                ? 'text-brand-600'
                : 'text-grey-40'
            }`}
          >
            {flowState.label}
          </span>
        </div>
        <ProgressBar
          pct={flowState.pct}
          tone={flowState.kind === 'completed' ? (outcome === 'failed' ? 'gray' : 'green') : 'brand'}
        />
        {flowState.sub && <div className="text-xs text-grey-40 mt-1.5">{flowState.sub}</div>}
      </div>

      {/* Trainings */}
      {trainingRows.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-surface-divider">
          {trainingRows.map((t) => (
            <div key={t.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-grey-20 truncate" title={t.title}>
                  Training: <span className="text-grey-15">{t.title}</span>
                </span>
                <span
                  className={`text-xs font-medium ${
                    t.isCompleted ? 'text-green-700' : t.total === 0 ? 'text-grey-40' : 'text-brand-600'
                  }`}
                >
                  {t.total === 0
                    ? t.isCompleted
                      ? 'Completed'
                      : 'In progress'
                    : t.isCompleted
                    ? 'Completed'
                    : `${t.done} of ${t.total} sections`}
                </span>
              </div>
              <ProgressBar pct={t.isCompleted ? 100 : t.pct} tone={t.isCompleted ? 'green' : 'brand'} />
              {!t.isCompleted && t.currentSection && (
                <div className="text-xs text-grey-40 mt-1.5">
                  Currently on: {t.currentSection.title}
                </div>
              )}
              {t.isCompleted && t.completedAt && (
                <div className="text-xs text-grey-40 mt-1.5">
                  Finished {new Date(t.completedAt).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
