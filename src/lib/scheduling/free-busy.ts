/**
 * Google Calendar FreeBusy helper. Reads `freebusy.query` for the recruiter's
 * connected calendar and returns the busy intervals.
 *
 * Cache: per-process Map with 60s TTL keyed by (workspaceId, calendarId,
 * fromIsoMinute, toIsoMinute) where `from`/`to` are rounded down to the
 * minute. The picker UI fires availability requests as the candidate scrolls
 * the date strip; the cache absorbs duplicate requests within the same view.
 *
 * No persistence — this is rebuilt cold on every server boot. Calendar quota
 * is generous (1M req/day per project), so persisting in Postgres is overkill
 * for v1. Move to Upstash if quota becomes an issue.
 */

import { google } from 'googleapis'
import type { BusyInterval } from './slot-computer'
import { getAuthedClientForWorkspace } from '../google'

const CACHE_TTL_MS = 60 * 1000

interface CacheEntry {
  fetchedAt: number
  busy: BusyInterval[]
}

const cache = new Map<string, CacheEntry>()

function cacheKey(workspaceId: string, calendarId: string, fromUtc: Date, toUtc: Date): string {
  // Round to minute to share cache across request bursts.
  const fromMin = Math.floor(fromUtc.getTime() / 60_000)
  const toMin = Math.floor(toUtc.getTime() / 60_000)
  return `${workspaceId}|${calendarId}|${fromMin}|${toMin}`
}

export interface GetBusyIntervalsOpts {
  workspaceId: string
  /** Defaults to the GoogleIntegration's calendarId. */
  calendarId?: string
  fromUtc: Date
  toUtc: Date
  /** Force a fresh fetch, bypassing the cache. Used by booking confirmation. */
  bustCache?: boolean
}

export async function getBusyIntervals(opts: GetBusyIntervalsOpts): Promise<BusyInterval[]> {
  const authed = await getAuthedClientForWorkspace(opts.workspaceId)
  if (!authed) throw new Error('Workspace has no connected Google integration')

  const calendarId = opts.calendarId || authed.integration.calendarId
  const key = cacheKey(opts.workspaceId, calendarId, opts.fromUtc, opts.toUtc)
  const now = Date.now()

  if (!opts.bustCache) {
    const hit = cache.get(key)
    if (hit && now - hit.fetchedAt < CACHE_TTL_MS) {
      return hit.busy
    }
  }

  const calendar = google.calendar({ version: 'v3', auth: authed.client })
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: opts.fromUtc.toISOString(),
      timeMax: opts.toUtc.toISOString(),
      items: [{ id: calendarId }],
    },
  })
  const calendars = res.data.calendars || {}
  const entry = calendars[calendarId]
  if (entry?.errors?.length) {
    // Most common: calendar not found / no permission. Surface as empty so
    // the picker still renders; recruiter can debug from settings.
    console.error('[free-busy] calendar errors:', entry.errors)
    return []
  }
  const busy: BusyInterval[] = (entry?.busy || [])
    .filter((b): b is { start: string; end: string } => Boolean(b.start) && Boolean(b.end))
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))

  cache.set(key, { fetchedAt: now, busy })
  return busy
}

/** Test/admin helper — wipe the in-process cache. */
export function _resetFreeBusyCache(): void {
  cache.clear()
}
