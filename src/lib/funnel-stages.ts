/**
 * Funnel stages — user-configurable kanban columns for the candidates view.
 *
 * Stored as a JSON array on Workspace.settings.funnelStages. Each stage's `id`
 * is what gets written to Session.pipelineStatus when a candidate is moved.
 *
 * Backward compatibility: legacy hardcoded statuses (applied, passed, failed,
 * rejected, hired, training_in_progress, training_completed,
 * invited_to_schedule, scheduled, completed_flow) still flow into the right
 * default stage via `mapLegacyStatusToStageId`. New custom stages use uuid-ish
 * slugs and never collide with the legacy values.
 */

import type { BadgeTone } from '@/components/design'

export interface FunnelStage {
  id: string
  label: string
  tone: BadgeTone   // drives badge color on candidate cards
  color: string     // accent dot color (CSS variable or hex)
  order: number
}

export const DEFAULT_FUNNEL_STAGES: FunnelStage[] = [
  { id: 'new',         label: 'New',         tone: 'neutral', color: 'var(--neutral-fg)',    order: 0 },
  { id: 'in_progress', label: 'In progress', tone: 'brand',   color: 'var(--brand-primary)', order: 1 },
  { id: 'hired',       label: 'Hired',       tone: 'success', color: 'var(--success-fg)',    order: 2 },
  { id: 'rejected',    label: 'Rejected',    tone: 'danger',  color: 'var(--danger-fg)',     order: 3 },
]

// Maps legacy/system pipeline_status strings (written by the flow engine)
// onto one of the default stage ids. Used as a fallback when a candidate's
// pipelineStatus doesn't match any user-defined stage id.
const LEGACY_STATUS_MAP: Record<string, string> = {
  applied:              'new',
  completed_flow:       'in_progress',
  passed:               'in_progress',
  training_in_progress: 'in_progress',
  training_completed:   'in_progress',
  invited_to_schedule:  'in_progress',
  scheduled:            'in_progress',
  hired:                'hired',
  failed:               'rejected',
  rejected:             'rejected',
}

export function mapLegacyStatusToStageId(status: string | null | undefined): string {
  if (!status) return 'new'
  return LEGACY_STATUS_MAP[status] ?? 'new'
}

// Validates and normalizes a stages array loaded from Workspace.settings.
// Returns DEFAULT_FUNNEL_STAGES if the input is missing or malformed.
export function normalizeStages(raw: unknown): FunnelStage[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_FUNNEL_STAGES
  const valid: FunnelStage[] = []
  const seenIds = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : null
    const label = typeof r.label === 'string' ? r.label : null
    if (!id || !label || seenIds.has(id)) continue
    seenIds.add(id)
    valid.push({
      id,
      label,
      tone: (typeof r.tone === 'string' ? r.tone : 'neutral') as BadgeTone,
      color: typeof r.color === 'string' ? r.color : 'var(--neutral-fg)',
      order: typeof r.order === 'number' ? r.order : valid.length,
    })
  }
  if (valid.length === 0) return DEFAULT_FUNNEL_STAGES
  return valid.sort((a, b) => a.order - b.order)
}

// Resolve which stage a candidate's pipelineStatus belongs to. Tries direct
// match first, then legacy fallback, then first stage as last resort.
export function resolveStage(
  pipelineStatus: string | null | undefined,
  stages: FunnelStage[],
): FunnelStage {
  if (pipelineStatus) {
    const direct = stages.find((s) => s.id === pipelineStatus)
    if (direct) return direct
    const legacyId = mapLegacyStatusToStageId(pipelineStatus)
    const fallback = stages.find((s) => s.id === legacyId)
    if (fallback) return fallback
  }
  return stages[0]
}

// Slugify a label into a stable id. Used when creating new custom stages.
export function makeStageId(label: string, existing: FunnelStage[]): string {
  const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'stage'
  const taken = new Set(existing.map((s) => s.id))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

export const STAGE_TONE_OPTIONS: Array<{ tone: BadgeTone; color: string; label: string }> = [
  { tone: 'neutral', color: 'var(--neutral-fg)',    label: 'Grey'   },
  { tone: 'brand',   color: 'var(--brand-primary)', label: 'Orange' },
  { tone: 'success', color: 'var(--success-fg)',    label: 'Green'  },
  { tone: 'warn',    color: '#D97706',              label: 'Amber'  },
  { tone: 'info',    color: '#2563EB',              label: 'Blue'   },
  { tone: 'danger',  color: 'var(--danger-fg)',     label: 'Red'    },
]
