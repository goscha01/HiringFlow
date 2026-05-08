import { PrismaClient } from '@prisma/client'
import { normalizeStages, findStageForEvent } from '../src/lib/funnel-stages'

const prisma = new PrismaClient()

async function main() {
  // Form step data is stored on Session.formData (JSON). Use raw SQL to search it
  // plus the candidate_* columns directly.
  const formMatches = await prisma.$queryRaw<Array<{ id: string; candidate_name: string | null; candidate_email: string | null; candidate_phone: string | null; pipeline_status: string | null; status: string | null; workspace_id: string; flow_id: string | null }>>`
    SELECT id, candidate_name, candidate_email, candidate_phone, pipeline_status, status, workspace_id, flow_id
    FROM "sessions"
    WHERE form_data::text ILIKE ${'%tetiana%'}
       OR form_data::text ILIKE ${'%karpova%'}
       OR form_data::text ILIKE ${'%9542269620%'}
       OR candidate_email ILIKE ${'%tetiana%'}
       OR candidate_phone LIKE ${'%9542269620%'}
       OR candidate_name ILIKE ${'%tetiana%'}
       OR candidate_name ILIKE ${'%karpova%'}
       OR candidate_name ILIKE ${'%tatiana%'}
    ORDER BY started_at DESC
    LIMIT 50
  `
  console.log(`Direct sessions match: ${formMatches.length}`)
  for (const m of formMatches) {
    console.log(`  id=${m.id}  name=${m.candidate_name}  email=${m.candidate_email}  phone=${m.candidate_phone}  pipeline=${m.pipeline_status}  status=${m.status}  ws=${m.workspace_id}  flow=${m.flow_id}`)
  }

  const sessionIdsFromSubs = Array.from(new Set(formMatches.map(m => m.id)))

  if (sessionIdsFromSubs.length === 0) {
    // Last-ditch: check if she landed in InterviewMeeting.participants without a session match
    const partMatch = await prisma.$queryRaw<Array<{ id: string; session_id: string | null; participants: unknown }>>`
      SELECT id, session_id, participants FROM "interview_meetings"
      WHERE participants::text ILIKE ${'%tetiana%'}
         OR participants::text ILIKE ${'%karpova%'}
      LIMIT 20
    `
    console.log(`\nInterviewMeeting.participants matches: ${partMatch.length}`)
    for (const p of partMatch) console.log(`  meeting=${p.id} session=${p.session_id} participants=${JSON.stringify(p.participants).slice(0,200)}`)

    const evMatch = await prisma.$queryRaw<Array<{ id: string; session_id: string | null; event_type: string; metadata: unknown }>>`
      SELECT id, session_id, event_type, metadata FROM "scheduling_events"
      WHERE metadata::text ILIKE ${'%tetiana%'}
         OR metadata::text ILIKE ${'%karpova%'}
         OR metadata::text ILIKE ${'%9542269620%'}
      ORDER BY event_at DESC
      LIMIT 20
    `
    console.log(`\nSchedulingEvent.metadata matches: ${evMatch.length}`)
    for (const e of evMatch) console.log(`  event=${e.id} session=${e.session_id} type=${e.event_type} meta=${JSON.stringify(e.metadata).slice(0,200)}`)
  }

  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { id: { in: sessionIdsFromSubs.length ? sessionIdsFromSubs : ['__none__'] } },
        { candidateEmail: { contains: 'tetianakarpova', mode: 'insensitive' } },
        { candidatePhone: { contains: '9542269620' } },
        { candidatePhone: { contains: '954-226-9620' } },
        { candidateName: { contains: 'Tetiana', mode: 'insensitive' } },
        { candidateName: { contains: 'Karpova', mode: 'insensitive' } },
        { candidateName: { contains: 'Tatiana', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true, workspaceId: true, flowId: true,
      candidateName: true, candidateEmail: true, candidatePhone: true,
      pipelineStatus: true, status: true, dispositionReason: true,
      stalledAt: true, lostAt: true, hiredAt: true,
      startedAt: true, finishedAt: true, lastActivityAt: true,
    },
    orderBy: { startedAt: 'desc' },
  })

  if (sessions.length === 0) { console.log('no Tetiana session found'); return }

  console.log(`Found ${sessions.length} session(s):`)
  for (const s of sessions) {
    console.log(`\n=== SESSION ${s.id} ===`)
    console.log(`  name=${s.candidateName} email=${s.candidateEmail} phone=${s.candidatePhone}`)
    console.log(`  workspaceId=${s.workspaceId} flowId=${s.flowId}`)
    console.log(`  pipelineStatus=${s.pipelineStatus}  status=${s.status}  dispositionReason=${s.dispositionReason}`)
    console.log(`  startedAt=${s.startedAt.toISOString()}  finishedAt=${s.finishedAt?.toISOString() ?? 'null'}`)
    console.log(`  lastActivityAt=${s.lastActivityAt?.toISOString() ?? 'null'}`)

    const flow = s.flowId ? await prisma.flow.findUnique({ where: { id: s.flowId }, select: { id: true, name: true } }) : null
    console.log(`  flow.name=${flow?.name ?? '(none)'}`)

    const ws = await prisma.workspace.findUnique({ where: { id: s.workspaceId }, select: { name: true, settings: true } })
    const stages = normalizeStages((ws?.settings as { funnelStages?: unknown } | null)?.funnelStages)
    console.log(`\n  WORKSPACE "${ws?.name}" stages:`)
    for (const st of stages) {
      console.log(`    [${st.order}] ${st.id.padEnd(40)} "${st.label}"  triggers=${JSON.stringify(st.triggers ?? [])}`)
    }

    const currentStage = stages.find(st => st.id === s.pipelineStatus)
    console.log(`\n  CURRENT pipelineStatus="${s.pipelineStatus}" → stage order=${currentStage?.order ?? 'unmapped'} label="${currentStage?.label ?? '(no match)'}"`)

    const meetingSchedStage = findStageForEvent(stages, 'meeting_scheduled', { flowId: s.flowId ?? undefined })
    console.log(`  Which stage would meeting_scheduled map to? ${meetingSchedStage ? `[${meetingSchedStage.order}] "${meetingSchedStage.label}" (id=${meetingSchedStage.id})` : '(NO STAGE CONFIGURED for meeting_scheduled)'}`)

    if (currentStage && meetingSchedStage) {
      if (meetingSchedStage.order < currentStage.order) {
        console.log(`  >>> BLOCKED: meetingSchedStage.order (${meetingSchedStage.order}) < currentStage.order (${currentStage.order}). Furthest-stage-wins guard refuses the move.`)
      } else if (meetingSchedStage.order === currentStage.order) {
        console.log(`  >>> Already at meeting_scheduled stage.`)
      } else {
        console.log(`  >>> Should have moved (${currentStage.order} → ${meetingSchedStage.order}). meeting_scheduled either never fired or stage transition errored.`)
      }
    }

    const meetings = await prisma.interviewMeeting.findMany({
      where: { sessionId: s.id },
      orderBy: { createdAt: 'asc' },
    })
    console.log(`\n  INTERVIEW MEETINGS (${meetings.length}):`)
    for (const m of meetings) {
      console.log(`    id=${m.id}`)
      console.log(`      scheduledStart=${m.scheduledStart?.toISOString() ?? 'null'}  scheduledEnd=${m.scheduledEnd?.toISOString() ?? 'null'}`)
      console.log(`      actualStart=${m.actualStart?.toISOString() ?? 'null'}  actualEnd=${m.actualEnd?.toISOString() ?? 'null'}`)
      console.log(`      confirmedAt=${(m as { confirmedAt?: Date }).confirmedAt?.toISOString?.() ?? 'null'}`)
      console.log(`      googleCalendarEventId=${m.googleCalendarEventId ?? '(none)'}  recordingState=${m.recordingState}  createdAt=${m.createdAt.toISOString()}`)
    }

    const events = await prisma.schedulingEvent.findMany({
      where: { sessionId: s.id },
      orderBy: { eventAt: 'asc' },
      select: { eventType: true, eventAt: true, metadata: true },
    })
    console.log(`\n  SCHEDULING EVENTS (${events.length}):`)
    for (const e of events) console.log(`    ${e.eventAt.toISOString()}  ${e.eventType}  ${JSON.stringify(e.metadata)}`)

    const enrolls = await prisma.trainingEnrollment.findMany({
      where: { sessionId: s.id },
      select: {
        id: true, trainingId: true, status: true, progress: true,
        startedAt: true, completedAt: true,
      },
    })
    console.log(`\n  TRAINING ENROLLMENTS (${enrolls.length}):`)
    for (const en of enrolls) {
      console.log(`    id=${en.id} trainingId=${en.trainingId} status=${en.status} startedAt=${en.startedAt?.toISOString() ?? 'null'} completedAt=${en.completedAt?.toISOString() ?? 'null'}`)
    }

    // Look for any Google Calendar event with her email as an attendee
    // (in case she booked via Calendly and the calendar watch hasn't fired yet
    //  or the event didn't get bound to a session).
    const extEvents = await prisma.$queryRaw<Array<{ id: string; google_calendar_event_id: string | null; session_id: string | null; participants: unknown; scheduled_start: Date | null; created_at: Date }>>`
      SELECT id, google_calendar_event_id, session_id, participants, scheduled_start, created_at
      FROM "interview_meetings"
      WHERE participants::text ILIKE ${'%tetianakarpova%'}
         OR participants::text ILIKE ${'%9542269620%'}
      ORDER BY created_at DESC LIMIT 10
    `
    console.log(`\n  ANY InterviewMeeting tied to her email/phone (across workspaces): ${extEvents.length}`)
    for (const e of extEvents) console.log(`    id=${e.id} session=${e.session_id} cal=${e.google_calendar_event_id} start=${e.scheduled_start?.toISOString() ?? 'null'}`)


    const execs = await prisma.automationExecution.findMany({
      where: { sessionId: s.id },
      orderBy: { createdAt: 'asc' },
      include: { automationRule: { select: { name: true, triggerType: true } } },
    })
    console.log(`\n  AUTOMATION EXECUTIONS (${execs.length}):`)
    for (const e of execs) {
      console.log(`    ${e.createdAt.toISOString()}  rule="${e.automationRule?.name}" trigger=${e.automationRule?.triggerType} status=${e.status} channel=${e.channel} sentAt=${e.sentAt?.toISOString() ?? 'null'}${e.errorMessage ? ` err=${e.errorMessage}` : ''}`)
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
