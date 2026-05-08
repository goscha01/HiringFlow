/**
 * Why did Georgiy Sayapin receive a "1 hour before" SMS at 8 AM today
 * for a meeting at 10 PM tonight?
 *
 * Pulls:
 *  - Session(s) matching georgiy / sayapin
 *  - InterviewMeeting rows (reschedule history via createdAt + scheduledStart)
 *  - SchedulingEvent timeline (meeting_scheduled / rescheduled / cancelled)
 *  - AutomationExecution rows (with rule.minutesBefore + step.delayMinutes/timingMode)
 *
 * Read-only.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/diagnose-georgiy-sms.ts dotenv_config_path=.env.diagnose
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function fmt(d: Date | null | undefined): string {
  if (!d) return '—'
  return d.toISOString()
}

async function main() {
  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { candidateName: { contains: 'georgiy', mode: 'insensitive' } },
        { candidateName: { contains: 'sayapin', mode: 'insensitive' } },
        { candidateEmail: { contains: 'sayapin', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true, workspaceId: true, candidateName: true, candidateEmail: true,
      candidatePhone: true, pipelineStatus: true, startedAt: true,
      workspace: { select: { name: true, timezone: true } },
    },
    orderBy: { startedAt: 'desc' },
  })

  console.log(`\n=== sessions: ${sessions.length} ===`)
  for (const s of sessions) {
    console.log(`  ${s.id}  ${s.candidateName}  ${s.candidateEmail}  phone=${s.candidatePhone}  ws=${s.workspace?.name} tz=${s.workspace?.timezone}`)
  }
  if (sessions.length === 0) return

  for (const s of sessions) {
    console.log(`\n\n========== ${s.candidateName} (${s.id}) ==========`)
    console.log(`workspace tz: ${s.workspace?.timezone}`)

    // --- Meetings ---
    const meetings = await prisma.interviewMeeting.findMany({
      where: { sessionId: s.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, createdAt: true, updatedAt: true,
        scheduledStart: true, scheduledEnd: true,
        actualStart: true, actualEnd: true,
        meetingUri: true, meetSpaceName: true,
        confirmedAt: true,
      },
    })
    console.log(`\n-- InterviewMeetings (${meetings.length}) --`)
    for (const m of meetings) {
      console.log(`  ${m.id}`)
      console.log(`    createdAt:      ${fmt(m.createdAt)}`)
      console.log(`    updatedAt:      ${fmt(m.updatedAt)}`)
      console.log(`    scheduledStart: ${fmt(m.scheduledStart)}`)
      console.log(`    scheduledEnd:   ${fmt(m.scheduledEnd)}`)
      console.log(`    actualStart:    ${fmt(m.actualStart)}`)
      console.log(`    confirmedAt:    ${fmt(m.confirmedAt)}`)
      console.log(`    space:          ${m.meetSpaceName}  uri=${m.meetingUri}`)
    }

    // --- Scheduling events (full history) ---
    const events = await prisma.schedulingEvent.findMany({
      where: { sessionId: s.id },
      orderBy: { eventAt: 'asc' },
      select: { eventType: true, eventAt: true, metadata: true },
    })
    console.log(`\n-- SchedulingEvents (${events.length}) --`)
    for (const e of events) {
      console.log(`  ${fmt(e.eventAt)}  ${e.eventType.padEnd(25)} ${JSON.stringify(e.metadata).slice(0, 200)}`)
    }

    // --- Automation Executions for this session ---
    const execs = await prisma.automationExecution.findMany({
      where: { sessionId: s.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, status: true, channel: true,
        createdAt: true, scheduledFor: true, sentAt: true,
        qstashMessageId: true, errorMessage: true,
        automationRule: {
          select: {
            id: true, name: true, triggerType: true, minutesBefore: true, isActive: true,
          },
        },
        step: {
          select: {
            id: true, order: true, delayMinutes: true, timingMode: true, channel: true,
            smsBody: true, smsDestination: true,
          },
        },
      },
    })
    console.log(`\n-- AutomationExecutions (${execs.length}) --`)
    for (const x of execs) {
      const rule = x.automationRule
      const step = x.step
      console.log(`  exec ${x.id}`)
      console.log(`    rule:        ${rule?.name}  trigger=${rule?.triggerType}  minutesBefore=${rule?.minutesBefore}  isActive=${rule?.isActive}`)
      console.log(`    step:        order=${step?.order}  delayMinutes=${step?.delayMinutes}  timingMode=${step?.timingMode}  channel=${step?.channel}  smsDest=${step?.smsDestination}`)
      console.log(`    channel:     ${x.channel}`)
      console.log(`    status:      ${x.status}`)
      console.log(`    createdAt:   ${fmt(x.createdAt)}`)
      console.log(`    scheduledFor:${fmt(x.scheduledFor)}`)
      console.log(`    sentAt:      ${fmt(x.sentAt)}`)
      console.log(`    qstashMsgId: ${x.qstashMessageId ?? '—'}`)
      if (x.errorMessage) console.log(`    error:       ${x.errorMessage}`)
      if (step?.smsBody) console.log(`    smsBody:     ${step.smsBody.slice(0, 160)}`)
    }

    // --- All before_meeting rules in this workspace (for reference) ---
    const rules = await prisma.automationRule.findMany({
      where: {
        workspaceId: s.workspaceId,
        triggerType: 'before_meeting',
      },
      select: {
        id: true, name: true, isActive: true, minutesBefore: true, flowId: true, createdAt: true, updatedAt: true,
        steps: { orderBy: { order: 'asc' }, select: { id: true, order: true, delayMinutes: true, timingMode: true, channel: true, smsDestination: true } },
      },
    })
    console.log(`\n-- before_meeting rules in workspace (${rules.length}) --`)
    for (const r of rules) {
      console.log(`  ${r.id}  ${r.name}  active=${r.isActive}  minutesBefore=${r.minutesBefore}  flowId=${r.flowId}`)
      for (const st of r.steps) console.log(`    step order=${st.order}  delay=${st.delayMinutes}m  timingMode=${st.timingMode}  channel=${st.channel}  smsDest=${st.smsDestination}`)
    }
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
