import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const status = request.nextUrl.searchParams.get('status')
  const flowId = request.nextUrl.searchParams.get('flowId')
  const search = request.nextUrl.searchParams.get('search')

  const where: Record<string, unknown> = { workspaceId: ws.workspaceId }

  if (status && status !== 'all') {
    where.pipelineStatus = status
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

  const sessions = await prisma.session.findMany({
    where: where as any,
    orderBy: { startedAt: 'desc' },
    include: {
      flow: { select: { id: true, name: true, slug: true } },
      ad: { select: { id: true, name: true, source: true } },
      answers: { select: { id: true } },
      submissions: { select: { id: true } },
      trainingEnrollments: { select: { id: true, status: true, completedAt: true } },
      schedulingEvents: { select: { id: true, eventType: true, eventAt: true } },
    },
  })

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

  return NextResponse.json(deduped.map(s => ({
    id: s.id,
    candidateName: s.candidateName,
    candidateEmail: s.candidateEmail,
    candidatePhone: s.candidatePhone,
    outcome: s.outcome,
    pipelineStatus: s.pipelineStatus,
    rejectionReason: s.rejectionReason,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    source: s.source,
    flow: s.flow,
    ad: s.ad,
    answerCount: s.answers.length,
    submissionCount: s.submissions.length,
    trainingStatus: s.trainingEnrollments[0]?.status || null,
    trainingCompletedAt: s.trainingEnrollments[0]?.completedAt || null,
    schedulingEvents: s.schedulingEvents.length,
    lastSchedulingEvent: s.schedulingEvents[0]?.eventType || null,
  })))
}
