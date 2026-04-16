/**
 * GET /api/cron/meet-subscriptions-renew
 *
 * Backup + GC for Workspace Events subscriptions. The primary renewal path is
 * in-band via subscription.expirationReminder CloudEvents delivered to the
 * Meet webhook — healthy steady state has "renewed: 0" here. This cron is the
 * safety net for webhook outages, plus the GC runner that tears down
 * subscriptions on finished meetings whose artifacts are fully resolved.
 *
 * Vercel Cron calls this daily (see vercel.json).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthedClientForWorkspace } from '@/lib/google'
import { globalKillswitchActive } from '@/lib/meet/feature-flag'
import { renewSubscription, subscribeSpace, deleteSubscription, WorkspaceEventsError } from '@/lib/meet/workspace-events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (globalKillswitchActive()) {
    return NextResponse.json({ ok: true, killswitch: true })
  }

  const now = new Date()
  const renewCutoff = new Date(now.getTime() + 36 * 60 * 60 * 1000)

  // --- Renewal (backup) ---
  const toRenew = await prisma.interviewMeeting.findMany({
    where: {
      actualEnd: null,
      workspaceEventsSubName: { not: null },
      workspaceEventsSubExpiresAt: { lt: renewCutoff },
    },
    select: { id: true, workspaceId: true, meetSpaceName: true, workspaceEventsSubName: true },
    take: 200,
  })

  let renewed = 0, recreated = 0, renewFailed = 0
  for (const m of toRenew) {
    try {
      const authed = await getAuthedClientForWorkspace(m.workspaceId)
      if (!authed) { renewFailed++; continue }
      try {
        const r = await renewSubscription(authed.client, m.workspaceEventsSubName!)
        await prisma.interviewMeeting.update({
          where: { id: m.id },
          data: { workspaceEventsSubExpiresAt: r.expireTime ? new Date(r.expireTime) : null },
        })
        renewed++
      } catch (err) {
        // Gone — recreate
        if (err instanceof WorkspaceEventsError && (err.status === 404 || err.status === 410)) {
          const r = await subscribeSpace(authed.client, m.meetSpaceName)
          await prisma.interviewMeeting.update({
            where: { id: m.id },
            data: { workspaceEventsSubName: r.name, workspaceEventsSubExpiresAt: r.expireTime ? new Date(r.expireTime) : null },
          })
          recreated++
        } else {
          throw err
        }
      }
    } catch (err) {
      renewFailed++
      console.error('[Meet cron] renewal failed for', m.id, err)
    }
  }

  // --- GC: tear down subscriptions for finished meetings with resolved artifacts ---
  const terminalRec = ['ready', 'disabled', 'failed', 'unavailable']
  const terminalTrans = ['ready', 'disabled', 'failed']
  const toGc = await prisma.interviewMeeting.findMany({
    where: {
      actualEnd: { not: null },
      workspaceEventsSubName: { not: null },
      recordingState: { in: terminalRec },
      transcriptState: { in: terminalTrans },
    },
    select: { id: true, workspaceId: true, workspaceEventsSubName: true },
    take: 200,
  })
  let gcDeleted = 0, gcFailed = 0
  for (const m of toGc) {
    try {
      const authed = await getAuthedClientForWorkspace(m.workspaceId)
      if (!authed) continue
      await deleteSubscription(authed.client, m.workspaceEventsSubName!).catch((err) => {
        if (err instanceof WorkspaceEventsError && (err.status === 404 || err.status === 410)) return
        throw err
      })
      await prisma.interviewMeeting.update({
        where: { id: m.id },
        data: { workspaceEventsSubName: null, workspaceEventsSubExpiresAt: null },
      })
      gcDeleted++
    } catch (err) {
      gcFailed++
      console.error('[Meet cron] GC failed for', m.id, err)
    }
  }

  // --- Release waiting_for_recording automations past their cutoff ---
  // The cutoff is encoded as AutomationExecution.scheduledFor.
  const waiting = await prisma.automationExecution.findMany({
    where: {
      status: 'waiting_for_recording',
      scheduledFor: { lt: now },
    },
    select: { id: true, automationRuleId: true, sessionId: true },
    take: 200,
  })
  let released = 0, releaseFailed = 0
  for (const w of waiting) {
    if (!w.sessionId) continue
    try {
      // Dynamic import to avoid circular dep with automation.ts
      const { executeRule } = await import('@/lib/automation')
      await executeRule(w.automationRuleId, w.sessionId)
      released++
    } catch (err) {
      releaseFailed++
      console.error('[Meet cron] waiting release failed for', w.id, err)
    }
  }

  console.log(`[Meet cron] renewed=${renewed} recreated=${recreated} renewFailed=${renewFailed} gcDeleted=${gcDeleted} gcFailed=${gcFailed} released=${released} releaseFailed=${releaseFailed}`)
  return NextResponse.json({ renewed, recreated, renewFailed, gcDeleted, gcFailed, released, releaseFailed })
}
