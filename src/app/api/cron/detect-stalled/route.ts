/**
 * GET /api/cron/detect-stalled
 *
 * Daily sweep that flips `Session.status` from 'active' → 'stalled' when a
 * candidate has gone quiet at a known checkpoint. The four detection rules
 * mirror the spec — see `src/lib/candidate-status.ts` for the disposition
 * enum values written here:
 *
 *   1. Flow / video interview not completed
 *      Session started but never finished, beyond `videoInterviewTimeoutDays`.
 *      → status='stalled', dispositionReason='video_interview_not_completed'
 *
 *   2. Training sent, never started
 *      A TrainingAccessToken exists, but no TrainingEnrollment for that
 *      session/training has progressed past status='not_started', and the
 *      token is older than `trainingTimeoutDays`.
 *      → status='stalled', dispositionReason='training_not_started'
 *
 *   3. Training started, never completed
 *      An in-progress TrainingEnrollment older than `trainingTimeoutDays`
 *      with no completion AND no recent Session.lastActivityAt.
 *      → status='stalled', dispositionReason='training_not_completed'
 *
 *   4. Scheduled interview missed (silent path)
 *      An InterviewMeeting whose scheduled time + `noShowTimeoutHours` has
 *      elapsed without an `actualStart` AND without a `meeting_no_show`
 *      SchedulingEvent. This catches the "neither party joined" edge case
 *      that Workspace Events can't detect.
 *      → status='stalled' (NOT 'lost' — the meeting_no_show event handler
 *        still owns the lost transition; the cron only flags the silence)
 *      → dispositionReason='interview_no_show'
 *
 * Timeouts come from the per-flow columns (`videoInterviewTimeoutDays`,
 * `trainingTimeoutDays`, `noShowTimeoutHours`) and fall back to the platform
 * defaults in `DEFAULT_TIMEOUTS` when null.
 *
 * Idempotent: every WHERE clause filters `status='active'` so re-running the
 * cron never overwrites a manual `nurture` / `lost` / `hired` / `stalled`
 * action. Once a candidate flips to 'stalled', subsequent runs leave them
 * alone — the next status change has to come from a forward-progress event
 * (clears stalled in `applyStageTrigger`) or a manual lifecycle action.
 *
 * Vercel cron schedule: daily 4:00 UTC (after the Calendar/Meet renewals).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEOUTS, type CandidateDispositionReason } from '@/lib/candidate-status'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface SweepCounts {
  videoInterviewNotCompleted: number
  trainingNotStarted: number
  trainingNotCompleted: number
  interviewNoShowSilent: number
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const counts: SweepCounts = {
    videoInterviewNotCompleted: 0,
    trainingNotStarted: 0,
    trainingNotCompleted: 0,
    interviewNoShowSilent: 0,
  }

  // -- Rule 1: video interview not completed -----------------------------
  // Per-flow timeout: the candidate's flow's videoInterviewTimeoutDays, or
  // the platform default. Group sessions by flowId so we can batch the
  // cutoff comparison without per-row queries.
  const flows = await prisma.flow.findMany({
    select: {
      id: true,
      videoInterviewTimeoutDays: true,
      trainingTimeoutDays: true,
      noShowTimeoutHours: true,
    },
  })

  for (const flow of flows) {
    const days = flow.videoInterviewTimeoutDays ?? DEFAULT_TIMEOUTS.videoInterviewTimeoutDays
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const result = await prisma.session.updateMany({
      where: {
        flowId: flow.id,
        status: 'active',
        finishedAt: null,
        startedAt: { lt: cutoff },
      },
      data: stalledPayload(now, 'video_interview_not_completed'),
    })
    counts.videoInterviewNotCompleted += result.count
  }

  // -- Rule 2: training sent, never started -----------------------------
  // The "sent but ignored" signal lives on TrainingAccessToken — when the
  // automation sends a training invite, a token row is created. Clicking
  // the link upserts a TrainingEnrollment with status='in_progress' (see
  // src/lib/training-access.ts). So:
  //   token.usedAt IS NULL  ↔  candidate never opened the training
  //   no enrollment exists  ↔  same signal, alternate evidence
  //
  // We flag a candidate when:
  //   - they have at least one unused token older than `trainingTimeoutDays`, AND
  //   - they have no enrollment that has progressed past 'not_started'
  // The "every" guard excludes candidates who did start a different
  // training but were also sent a second one they ignored.
  for (const flow of flows) {
    const days = flow.trainingTimeoutDays ?? DEFAULT_TIMEOUTS.trainingTimeoutDays
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const stalledCandidates = await prisma.session.findMany({
      where: {
        flowId: flow.id,
        status: 'active',
        OR: [
          // (a) Unused access token older than the cutoff, no progressed
          // enrollment. Catches the common "automation sent training
          // invite, candidate never clicked" case (e.g. Toya West).
          {
            trainingAccessTokens: {
              some: { usedAt: null, createdAt: { lt: cutoff } },
            },
            trainingEnrollments: {
              none: { status: { not: 'not_started' } },
            },
          },
          // (b) Belt-and-suspenders: enrollment manually created at
          // 'not_started' (some legacy paths do this) and never advanced.
          {
            trainingEnrollments: {
              some: { status: 'not_started', startedAt: { lt: cutoff } },
              every: { status: 'not_started' },
            },
          },
        ],
      },
      select: { id: true },
    })
    if (stalledCandidates.length > 0) {
      const result = await prisma.session.updateMany({
        where: {
          id: { in: stalledCandidates.map((s) => s.id) },
          status: 'active',
        },
        data: stalledPayload(now, 'training_not_started'),
      })
      counts.trainingNotStarted += result.count
    }
  }

  // -- Rule 3: training started, never completed -------------------------
  for (const flow of flows) {
    const days = flow.trainingTimeoutDays ?? DEFAULT_TIMEOUTS.trainingTimeoutDays
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const stuck = await prisma.session.findMany({
      where: {
        flowId: flow.id,
        status: 'active',
        trainingEnrollments: {
          some: {
            status: 'in_progress',
            completedAt: null,
            startedAt: { lt: cutoff },
          },
        },
        // Use lastActivityAt to avoid flagging candidates who just opened
        // the training a moment ago — the heartbeat bumps on every public
        // POST. If lastActivityAt is null we fall back to startedAt.
        OR: [
          { lastActivityAt: null },
          { lastActivityAt: { lt: cutoff } },
        ],
      },
      select: { id: true },
    })
    if (stuck.length > 0) {
      const result = await prisma.session.updateMany({
        where: { id: { in: stuck.map((s) => s.id) }, status: 'active' },
        data: stalledPayload(now, 'training_not_completed'),
      })
      counts.trainingNotCompleted += result.count
    }
  }

  // -- Rule 4: silent missed interview ----------------------------------
  // The Meet webhook handler stamps lost+interview_no_show when it sees
  // conference.ended with zero non-host participants. The cron only handles
  // the silent path: scheduled meeting, time elapsed, no actualStart, no
  // meeting_no_show event. Mark as 'stalled' (not 'lost') so a recruiter
  // can investigate before declaring the candidate lost.
  for (const flow of flows) {
    const hours = flow.noShowTimeoutHours ?? DEFAULT_TIMEOUTS.noShowTimeoutHours
    const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000)
    // Find sessions in this flow with at least one elapsed-but-not-started
    // meeting and no recorded no-show event for it.
    const candidates = await prisma.session.findMany({
      where: {
        flowId: flow.id,
        status: 'active',
        interviewMeetings: {
          some: {
            scheduledStart: { lt: cutoff },
            actualStart: null,
          },
        },
      },
      select: {
        id: true,
        interviewMeetings: {
          where: { scheduledStart: { lt: cutoff }, actualStart: null },
          select: { id: true },
        },
        schedulingEvents: {
          where: { eventType: 'meeting_no_show' },
          select: { id: true },
        },
      },
    })
    const targets = candidates
      .filter((c) => c.interviewMeetings.length > 0 && c.schedulingEvents.length === 0)
      .map((c) => c.id)
    if (targets.length > 0) {
      const result = await prisma.session.updateMany({
        where: { id: { in: targets }, status: 'active' },
        data: stalledPayload(now, 'interview_no_show'),
      })
      counts.interviewNoShowSilent += result.count
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    counts,
  })
}

function stalledPayload(now: Date, reason: CandidateDispositionReason) {
  return {
    status: 'stalled',
    dispositionReason: reason,
    stalledAt: now,
  }
}
