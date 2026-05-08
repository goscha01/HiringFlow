/**
 * Read-only investigation: where is Yanique's training enrollment, and is there
 * a Session row hooked up to it? If not, that's why she doesn't show on the
 * dashboard (which queries Session only).
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/investigate-yanique.ts dotenv_config_path=.env.production
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function header(s: string) { console.log(`\n=== ${s} ===`) }

async function main() {
  const needle = (process.argv[2] || 'yanique').toLowerCase()

  header(`TrainingEnrollments matching "${needle}"`)
  const enrollments = await prisma.trainingEnrollment.findMany({
    where: {
      OR: [
        { userName: { contains: needle, mode: 'insensitive' } },
        { userEmail: { contains: needle, mode: 'insensitive' } },
      ],
    },
    include: {
      training: { select: { id: true, title: true, slug: true, workspaceId: true } },
      accessToken: {
        select: { id: true, token: true, candidateId: true, sourceType: true, sourceRefId: true, status: true, usedAt: true, createdAt: true },
      },
      session: {
        select: {
          id: true, workspaceId: true, candidateName: true, candidateEmail: true,
          candidatePhone: true, pipelineStatus: true, outcome: true,
          startedAt: true, finishedAt: true, flowId: true,
        },
      },
    },
    orderBy: { startedAt: 'desc' },
    take: 10,
  })
  console.log(`found ${enrollments.length} enrollment(s)`)
  for (const e of enrollments) {
    console.log('\n  enrollment id =', e.id)
    console.log('    userName=', e.userName)
    console.log('    userEmail=', e.userEmail)
    console.log('    status=', e.status, ' completedAt=', e.completedAt?.toISOString() ?? 'null')
    console.log('    startedAt=', e.startedAt.toISOString())
    console.log('    training=', e.training.title, ' (slug=', e.training.slug, ', ws=', e.training.workspaceId, ')')
    console.log('    sessionId on enrollment =', e.sessionId ?? 'NULL ←—— if null, automations did not fire and dashboard will not show her')
    if (e.accessToken) {
      console.log('    accessToken: id=', e.accessToken.id, ' candidateId(=Session)=', e.accessToken.candidateId ?? 'NULL', ' sourceType=', e.accessToken.sourceType, ' sourceRefId=', e.accessToken.sourceRefId, ' status=', e.accessToken.status, ' usedAt=', e.accessToken.usedAt?.toISOString() ?? 'null')
    } else {
      console.log('    accessToken: (none)')
    }
    if (e.session) {
      console.log('    linked session:')
      console.log('      id=', e.session.id, ' ws=', e.session.workspaceId, ' flowId=', e.session.flowId)
      console.log('      candidateName=', e.session.candidateName, ' email=', e.session.candidateEmail)
      console.log('      pipelineStatus=', e.session.pipelineStatus, ' outcome=', e.session.outcome)
      console.log('      startedAt=', e.session.startedAt.toISOString(), ' finishedAt=', e.session.finishedAt?.toISOString() ?? 'null')
    }
  }

  // Also: any Session rows directly for this candidate (covers case where a
  // Session exists but isn't linked back from the enrollment).
  header(`Sessions matching "${needle}" (independent of enrollment.sessionId)`)
  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { candidateName: { contains: needle, mode: 'insensitive' } },
        { candidateEmail: { contains: needle, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true, workspaceId: true, flowId: true,
      candidateName: true, candidateEmail: true, candidatePhone: true,
      pipelineStatus: true, outcome: true,
      startedAt: true, finishedAt: true,
    },
    orderBy: { startedAt: 'desc' },
    take: 10,
  })
  console.log(`found ${sessions.length} session(s)`)
  for (const s of sessions) {
    console.log('  -', s.id, '| ws=', s.workspaceId, '| flow=', s.flowId, '|', s.candidateName, '|', s.candidateEmail, '| pipelineStatus=', s.pipelineStatus, '| outcome=', s.outcome)
  }

  // AutomationExecutions referencing any of the candidate's session IDs (the
  // execution row carries sessionId, not the recipient email — the rule does).
  const allSessionIds = new Set<string>()
  for (const e of enrollments) if (e.sessionId) allSessionIds.add(e.sessionId)
  for (const s of sessions) allSessionIds.add(s.id)
  if (allSessionIds.size > 0) {
    header(`AutomationExecutions for sessionIds: ${Array.from(allSessionIds).join(', ')}`)
    const execs = await prisma.automationExecution.findMany({
      where: { sessionId: { in: Array.from(allSessionIds) } },
      include: { automationRule: { select: { id: true, name: true, triggerType: true, channel: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    console.log(`found ${execs.length} execution(s)`)
    for (const x of execs) {
      console.log('  -', x.createdAt.toISOString(), '| trigger=', x.automationRule.triggerType, '| channel=', x.channel, '| status=', x.status, '| sessionId=', x.sessionId, '| rule=', x.automationRule.name)
    }
  } else {
    console.log('\n(No sessionIds — cannot look up AutomationExecutions; they key off sessionId)')
  }

  // Workspace funnel stages — what columns does this kanban have, and what
  // triggers each one?
  if (sessions[0]) {
    const wsId = sessions[0].workspaceId
    header(`Workspace ${wsId} — funnelStages`)
    const ws = await prisma.workspace.findUnique({
      where: { id: wsId },
      select: { id: true, name: true, settings: true },
    })
    console.log('  workspace name=', ws?.name)
    const stages = (ws?.settings as any)?.funnelStages ?? null
    if (!stages) {
      console.log('  funnelStages: (none — using DEFAULT_FUNNEL_STAGES: new / in_progress / hired / rejected)')
    } else {
      console.log('  funnelStages:')
      for (const s of stages) {
        console.log(`    [order=${s.order}] id=${s.id}  label="${s.label}"  triggers=${JSON.stringify(s.triggers ?? [])}`)
      }
    }
  }

  // SchedulingEvents on Yanique's session — did meeting_scheduled fire?
  if (sessions[0]) {
    header(`SchedulingEvents on session ${sessions[0].id}`)
    const evts = await prisma.schedulingEvent.findMany({
      where: { sessionId: sessions[0].id },
      orderBy: { eventAt: 'asc' },
      select: { eventType: true, eventAt: true, metadata: true },
    })
    console.log('  count=', evts.length)
    for (const e of evts) {
      console.log('   -', e.eventAt.toISOString(), e.eventType, JSON.stringify(e.metadata))
    }

    header(`InterviewMeetings on session ${sessions[0].id}`)
    const ms = await prisma.interviewMeeting.findMany({
      where: { sessionId: sessions[0].id },
      select: { id: true, scheduledStart: true, scheduledEnd: true, meetingUri: true, actualStart: true, actualEnd: true },
    })
    console.log('  count=', ms.length)
    for (const m of ms) {
      console.log('   -', m.id, ' scheduled=', m.scheduledStart?.toISOString(), '→', m.scheduledEnd?.toISOString(), ' uri=', m.meetingUri)
    }
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
