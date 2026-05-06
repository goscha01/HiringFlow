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

// System events that can auto-place a candidate into a stage. The set is
// closed (only events the engine actually fires); each event's payload tells
// us which entity (flow / training) it relates to, which we use as targetId
// when matching triggers.
export type StageTriggerEvent =
  | 'flow_passed'
  | 'flow_completed'
  | 'training_started'
  | 'training_completed'
  | 'meeting_scheduled'
  | 'meeting_confirmed'
  | 'meeting_cancelled'
  | 'meeting_started'
  | 'meeting_ended'
  | 'meeting_no_show'
  | 'background_check_passed'
  | 'background_check_failed'
  | 'background_check_needs_review'

export interface StageTrigger {
  event: StageTriggerEvent
  // For flow / training events, the specific flow or training id this trigger
  // applies to. Omit (or empty) to match any flow / training of that event.
  targetId?: string
}

export interface FunnelStage {
  id: string
  label: string
  tone: BadgeTone   // drives badge color on candidate cards
  color: string     // accent dot color (CSS variable or hex)
  order: number
  triggers?: StageTrigger[]   // system events that auto-move candidates here
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
    const triggers = Array.isArray(r.triggers)
      ? (r.triggers as unknown[]).flatMap((t): StageTrigger[] => {
          if (!t || typeof t !== 'object') return []
          const tr = t as Record<string, unknown>
          if (typeof tr.event !== 'string') return []
          const allowed: StageTriggerEvent[] = [
            'flow_passed', 'flow_completed', 'training_started', 'training_completed',
            'meeting_scheduled', 'meeting_confirmed', 'meeting_cancelled',
            'meeting_started', 'meeting_ended', 'meeting_no_show',
            'background_check_passed', 'background_check_failed', 'background_check_needs_review',
          ]
          if (!allowed.includes(tr.event as StageTriggerEvent)) return []
          return [{
            event: tr.event as StageTriggerEvent,
            targetId: typeof tr.targetId === 'string' && tr.targetId ? tr.targetId : undefined,
          }]
        })
      : undefined
    valid.push({
      id,
      label,
      tone: (typeof r.tone === 'string' ? r.tone : 'neutral') as BadgeTone,
      color: typeof r.color === 'string' ? r.color : 'var(--neutral-fg)',
      order: typeof r.order === 'number' ? r.order : valid.length,
      ...(triggers && triggers.length ? { triggers } : {}),
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

// Pick the stage that should fire for a given event. Matches by event name
// first, then by targetId if the trigger names one. A trigger without a
// targetId acts as a wildcard for that event. Returns null if no stage
// declares a matching trigger — caller should fall back to legacy status.
export function findStageForEvent(
  stages: FunnelStage[],
  event: StageTriggerEvent,
  ctx: { flowId?: string; trainingId?: string },
): FunnelStage | null {
  const target = event.startsWith('flow_') ? ctx.flowId
    : event.startsWith('training_') ? ctx.trainingId
    : undefined
  for (const stage of stages) {
    for (const trig of stage.triggers ?? []) {
      if (trig.event !== event) continue
      // Exact target match wins; wildcard (no targetId) matches any.
      if (trig.targetId && trig.targetId !== target) continue
      return stage
    }
  }
  return null
}

// "Furthest stage wins" — given the full event history of a candidate,
// returns the matching stage with the highest order in the funnel. Used by
// the backfill so that a candidate who triggered both training_completed
// (order 3) and meeting_scheduled (order 4) lands in the latter, but a
// candidate who only triggered training_completed stays in Training
// Finished even if a stale older event also matches an earlier stage.
//
// Returns null if no event matches any configured trigger.
export function findFurthestStageForEvents(
  stages: FunnelStage[],
  events: Array<{ event: StageTriggerEvent; flowId?: string; trainingId?: string }>,
): FunnelStage | null {
  let best: FunnelStage | null = null
  for (const ev of events) {
    const match = findStageForEvent(stages, ev.event, ev)
    if (!match) continue
    if (!best || match.order > best.order) best = match
  }
  return best
}

export const STAGE_TONE_OPTIONS: Array<{ tone: BadgeTone; color: string; label: string }> = [
  { tone: 'neutral', color: 'var(--neutral-fg)',    label: 'Grey'   },
  { tone: 'brand',   color: 'var(--brand-primary)', label: 'Orange' },
  { tone: 'success', color: 'var(--success-fg)',    label: 'Green'  },
  { tone: 'warn',    color: '#D97706',              label: 'Amber'  },
  { tone: 'info',    color: '#2563EB',              label: 'Blue'   },
  { tone: 'danger',  color: 'var(--danger-fg)',     label: 'Red'    },
]
