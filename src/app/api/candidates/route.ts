import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const status = request.nextUrl.searchParams.get('status')
  const flowId = request.nextUrl.searchParams.get('flowId')
  const search = request.nextUrl.searchParams.get('search')
  // `candidateStatus` is the new orthogonal axis (active/stalled/lost/...)
  // Accepts a comma-separated list, e.g. ?candidateStatus=active,waiting for
  // the kanban's default "active pool" view. `status` is the legacy alias
  // that still maps to pipelineStatus (funnel stage id) — left intact so
  // existing query params keep working.
  const candidateStatusParam = request.nextUrl.searchParams.get('candidateStatus')

  const where: Record<string, unknown> = { workspaceId: ws.workspaceId }

  if (status && status !== 'all') {
    where.pipelineStatus = status
  }
  if (candidateStatusParam && candidateStatusParam !== 'all') {
    const values = candidateStatusParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (values.length === 1) where.status = values[0]
    else if (values.length > 1) where.status = { in: values }
  }
  if (flowId) {
    where.flowId = flowId
  }
  if (search) {
    where.OR = [
      { candidateName: { contains: search, mode: 'insensitive' } },
      { candidateEmail: { contains: search, mode: 'insensitive' } },
      { candidatePhone: { contains: search, mode: 'insensitive' } },
    ]
  }

  const now = new Date()
  const sessions = await prisma.session.findMany({
    where: where as any,
    orderBy: { startedAt: 'desc' },
    include: {
      flow: { select: { id: true, name: true, slug: true } },
      ad: { select: { id: true, name: true, source: true } },
      answers: { select: { id: true } },
      submissions: { select: { id: true } },
      trainingEnrollments: { select: { id: true, status: true, completedAt: true } },
      schedulingEvents: { select: { id: true, eventType: true, eventAt: true, metadata: true } },
      // Next upcoming InterviewMeeting (Meet v2 path)
      interviewMeetings: {
        where: { scheduledStart: { gt: now } },
        orderBy: { scheduledStart: 'asc' },
        take: 1,
        select: { scheduledStart: true, meetingUri: true },
      },
    },
  })

  // Build email → earliest meeting_no_show timestamp map. A later session for
  // the same email is a "rebook" — i.e. the candidate took the no-show
  // follow-up invite and started over.
  const earliestNoShowByEmail = new Map<string, Date>()
  for (const s of sessions) {
    if (!s.candidateEmail) continue
    for (const ev of s.schedulingEvents) {
      if (ev.eventType !== 'meeting_no_show') continue
      const key = s.candidateEmail.toLowerCase().trim()
      const cur = earliestNoShowByEmail.get(key)
      if (!cur || ev.eventAt < cur) earliestNoShowByEmail.set(key, ev.eventAt)
    }
  }
  const computeIsRebook = (s: { candidateEmail: string | null; startedAt: Date }) => {
    if (!s.candidateEmail) return false
    const key = s.candidateEmail.toLowerCase().trim()
    const at = earliestNoShowByEmail.get(key)
    return !!at && s.startedAt > at
  }

  // Dedupe by candidate email: when the same person re-applies (e.g. they
  // clicked a no-show "re-book invite" and went through the flow again), the
  // database has multiple Session rows but the kanban should show only ONE
  // card per person — the most recent one (already first thanks to ordering
  // by startedAt desc). Sessions without an email stay individually since
  // they can't be merged. Older sessions remain queryable directly.
  const seenEmails = new Set<string>()
  const deduped = sessions.filter((s) => {
    if (!s.candidateEmail) return true
    const key = s.candidateEmail.toLowerCase().trim()
    if (seenEmails.has(key)) return false
    seenEmails.add(key)
    return true
  })

  // Next upcoming meeting time. Prefer the InterviewMeeting (Meet v2 row) when
  // present; fall back to the latest meeting_scheduled / meeting_rescheduled
  // SchedulingEvent's metadata for legacy / Calendly bookings that didn't go
  // through the Meet v2 adoption path.
  const computeNextMeetingAt = (s: typeof sessions[number]): Date | null => {
    const v2 = s.interviewMeetings[0]?.scheduledStart
    if (v2) return v2
    const evs = s.schedulingEvents
      .filter((e) => e.eventType === 'meeting_scheduled' || e.eventType === 'meeting_rescheduled')
      .map((e) => {
        const meta = e.metadata as Record<string, unknown> | null
        const at = typeof meta?.scheduledAt === 'string' ? new Date(meta.scheduledAt) : null
        return at && !isNaN(at.getTime()) ? at : null
      })
      .filter((d): d is Date => !!d && d.getTime() > now.getTime())
      .sort((a, b) => a.getTime() - b.getTime())
    return evs[0] ?? null
  }

  return NextResponse.json(deduped.map(s => ({
    isRebook: computeIsRebook(s),
    id: s.id,
    candidateName: s.candidateName,
    candidateEmail: s.candidateEmail,
    candidatePhone: s.candidatePhone,
    outcome: s.outcome,
    pipelineStatus: s.pipelineStatus,
    rejectionReason: s.rejectionReason,
    // Status axis fields (added 2026-05-06). Always serialized so the
    // kanban can filter and render the status badge / disposition pill
    // without a separate fetch per card.
    status: s.status,
    dispositionReason: s.dispositionReason,
    stalledAt: s.stalledAt,
    lostAt: s.lostAt,
    hiredAt: s.hiredAt,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    source: s.source,
    addedManually: s.addedManually,
    flow: s.flow,
    ad: s.ad,
    answerCount: s.answers.length,
    submissionCount: s.submissions.length,
    trainingStatus: s.trainingEnrollments[0]?.status || null,
    trainingCompletedAt: s.trainingEnrollments[0]?.completedAt || null,
    schedulingEvents: s.schedulingEvents.length,
    lastSchedulingEvent: s.schedulingEvents[0]?.eventType || null,
    nextMeetingAt: computeNextMeetingAt(s),
  })))
}

// Manually add a candidate without going through a flow. The Session row is
// the candidate's record; flowId is required (Session.flow is non-nullable).
// source='manual' marks the row so analytics can distinguish self-applied
// sessions from ones created by a recruiter.
export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const body = await request.json().catch(() => null) as {
    flowId?: string
    candidateName?: string | null
    candidateEmail?: string | null
    candidatePhone?: string | null
    pipelineStatus?: string | null
    source?: string | null
    sourceNote?: string | null
  } | null

  if (!body || typeof body.flowId !== 'string' || !body.flowId) {
    return NextResponse.json({ error: 'flowId is required' }, { status: 400 })
  }

  const flow = await prisma.flow.findFirst({
    where: { id: body.flowId, workspaceId: ws.workspaceId },
    select: { id: true },
  })
  if (!flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 })

  const trim = (v: unknown) => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t.length > 0 ? t : null
  }

  const name = trim(body.candidateName)
  const email = trim(body.candidateEmail)
  const phone = trim(body.candidatePhone)
  const pipelineStatus = trim(body.pipelineStatus)
  // source defaults to 'manual' (recruiter-created); the modal can pass any
  // built-in source id ('indeed', 'facebook', …) or a custom workspace label.
  const source = trim(body.source) ?? 'manual'
  const sourceNote = trim(body.sourceNote)

  if (!name && !email && !phone) {
    return NextResponse.json({ error: 'At least one of name, email, or phone is required' }, { status: 400 })
  }

  const created = await prisma.session.create({
    data: {
      workspaceId: ws.workspaceId,
      flowId: flow.id,
      candidateName: name,
      candidateEmail: email,
      candidatePhone: phone,
      pipelineStatus,
      source,
      // addedManually is independent of `source` — recruiter may pick
      // 'indeed' for analytics but the row was still created by hand.
      addedManually: true,
    },
    select: { id: true },
  })

  // Persist the recruiter's lead-origin comment as a regular CandidateNote
  // (recruiter-only, surfaces in the candidate detail Notes panel). Avoids a
  // separate column for what is essentially free-form context.
  if (sourceNote) {
    const author = await prisma.user.findUnique({
      where: { id: ws.userId },
      select: { name: true, email: true },
    })
    await prisma.candidateNote.create({
      data: {
        sessionId: created.id,
        workspaceId: ws.workspaceId,
        authorId: ws.userId,
        authorName: author?.name || author?.email || null,
        body: `Lead origin: ${sourceNote}`,
      },
    })
  }

  return NextResponse.json({ id: created.id }, { status: 201 })
}
