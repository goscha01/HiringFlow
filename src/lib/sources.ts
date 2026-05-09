/**
 * Single source of truth for candidate / ad sources.
 *
 * Built-in platforms are shared between the Ads page (creating an Ad with a
 * source) and the Candidates page (filtering / manually adding a candidate).
 * Workspaces can extend the list via `Workspace.settings.customSources` —
 * those entries flow into both pages.
 *
 * `manual` is candidate-only — it represents a session that was hand-created
 * by a recruiter rather than coming from an ad placement, so it doesn't
 * belong on the Ad source picker.
 */

export type SourceOption = { id: string; label: string }

export const BUILTIN_AD_SOURCES: SourceOption[] = [
  { id: 'indeed',     label: 'Indeed'     },
  { id: 'facebook',   label: 'Facebook'   },
  { id: 'craigslist', label: 'Craigslist' },
  { id: 'google',     label: 'Google'     },
  { id: 'linkedin',   label: 'LinkedIn'   },
  { id: 'instagram',  label: 'Instagram'  },
  { id: 'tiktok',     label: 'TikTok'     },
  { id: 'telegram',   label: 'Telegram'   },
  { id: 'referral',   label: 'Referral'   },
  { id: 'other',      label: 'Other'      },
]

export const BUILTIN_CANDIDATE_SOURCES: SourceOption[] = [
  { id: 'manual', label: 'Manual' },
  ...BUILTIN_AD_SOURCES,
]

const RESERVED_IDS = new Set<string>([
  'manual',
  ...BUILTIN_AD_SOURCES.map((s) => s.id),
])

export function normalizeCustomSources(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (RESERVED_IDS.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}
