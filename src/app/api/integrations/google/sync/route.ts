/**
 * Manual "Sync calendar now" — used to recover when the Calendar push channel
 * has expired (and the renewal cron didn't fix it). Steps:
 *
 *   1. stopWatch (best-effort) + startWatch — fresh push channel + new sync token
 *   2. List the last 30 days of calendar events (single-events expansion) and
 *      run each through processCalendarEvent — same logic as the webhook, so a
 *      Calendly booking created while the watch was dead gets logged as a
 *      meeting_scheduled SchedulingEvent retroactively.
 *
 * Returns counts so the UI can show "Synced 23 events, logged 7 new meetings".
 */

import { NextResponse } from 'next/server'
import { google, type calendar_v3 } from 'googleapis'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAuthedClientForWorkspace, startWatch, stopWatch } from '@/lib/google'
import { processCalendarEvent } from '@/lib/google-event-processor'

export async function POST() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const integration = await prisma.googleIntegration.findUnique({
    where: { workspaceId: ws.workspaceId },
  })
  if (!integration) {
    return NextResponse.json(
      { error: 'No Google integration — connect Google Calendar first' },
      { status: 400 },
    )
  }

  // 1. Renew the watch channel (best-effort stop then fresh start)
  let watchOk = true
  let watchError: string | null = null
  let needsReconnect = false
  try {
    await stopWatch(ws.workspaceId).catch(() => {})
    await startWatch(ws.workspaceId)
  } catch (err) {
    watchOk = false
    watchError = err instanceof Error ? err.message : String(err)
    if (/invalid_grant|invalid_token|unauthorized_client/i.test(watchError)) {
      needsReconnect = true
    }
    console.error('[Sync] startWatch failed:', watchError)
  }

  // If the refresh token is dead, no point trying the backfill — return early
  // with a clear signal to the UI.
  if (needsReconnect) {
    return NextResponse.json({
      watchOk: false,
      watchError,
      needsReconnect: true,
      processed: 0,
      matched: 0,
      backfillError: null,
    })
  }

  // 2. Backfill: list events from the last 30 days and process each.
  const authed = await getAuthedClientForWorkspace(ws.workspaceId)
  if (!authed) {
    return NextResponse.json({
      watchOk,
      watchError,
      processed: 0,
      matched: 0,
      backfillError: 'Could not authenticate Google client',
    })
  }

  const calendar = google.calendar({ version: 'v3', auth: authed.client })
  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  let processed = 0
  let matched = 0
  let backfillError: string | null = null

  try {
    let pageToken: string | undefined = undefined
    for (let page = 0; page < 20; page++) {
      const res: { data: calendar_v3.Schema$Events } = await calendar.events.list({
        calendarId: authed.integration.calendarId,
        timeMin,
        timeMax,
        showDeleted: false,
        singleEvents: true,
        maxResults: 250,
        pageToken,
      })
      const items = res.data.items ?? []
      for (const item of items) {
        const result = await processCalendarEvent(ws.workspaceId, item).catch((err) => {
          console.error('[Sync] processCalendarEvent error:', err)
          return null
        })
        processed++
        if (result?.matched) matched++
      }
      if (!res.data.nextPageToken) break
      pageToken = res.data.nextPageToken ?? undefined
    }
  } catch (err) {
    backfillError = err instanceof Error ? err.message : String(err)
    if (/invalid_grant|invalid_token|unauthorized_client/i.test(backfillError)) {
      needsReconnect = true
    }
    console.error('[Sync] events.list failed:', backfillError)
  }

  return NextResponse.json({
    watchOk,
    watchError,
    needsReconnect,
    processed,
    matched,
    backfillError,
  })
}
