/**
 * POST /api/candidates/[id]/schedule-interview
 *
 * Operator-side entry point for the Meet v2 scheduling flow. The full booking
 * logic (Meet space + Calendar event + InterviewMeeting + automations) lives
 * in src/lib/scheduling/book-interview.ts and is shared with the public
 * candidate booking endpoint. Keep this route thin — every divergence from
 * the public flow is a future bug.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { bookInterview, BookInterviewError } from '@/lib/scheduling/book-interview'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const body = await request.json().catch(() => ({})) as {
    scheduledAt?: string
    durationMinutes?: number
    record?: boolean
    notes?: string
    attendeeEmail?: string
    schedulingConfigId?: string
  }

  if (!body.scheduledAt || isNaN(new Date(body.scheduledAt).getTime())) {
    return NextResponse.json({ error: 'Valid scheduledAt (ISO string) required' }, { status: 400 })
  }

  try {
    const result = await bookInterview({
      workspaceId: ws.workspaceId,
      sessionId: params.id,
      scheduledAt: new Date(body.scheduledAt),
      durationMinutes: body.durationMinutes,
      record: body.record,
      notes: body.notes,
      attendeeEmail: body.attendeeEmail,
      schedulingConfigId: body.schedulingConfigId,
      source: 'operator',
      loggedBy: ws.userId,
    })
    return NextResponse.json({
      success: true,
      interviewMeeting: result.interviewMeeting,
      warnings: result.warnings,
    })
  } catch (err) {
    if (err instanceof BookInterviewError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status },
      )
    }
    console.error('[Schedule-interview] unexpected error:', err)
    return NextResponse.json({ error: 'internal', message: (err as Error).message }, { status: 500 })
  }
}
