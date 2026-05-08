import { PrismaClient } from '@prisma/client'
import { normalizeStages, findStageForEvent } from '../src/lib/funnel-stages'

const prisma = new PrismaClient()

async function main() {
  const wsId = '739bcd71-69fd-4b30-a39e-242521b7ab20'

  const session = await prisma.session.findFirst({
    where: { workspaceId: wsId, candidateName: { contains: 'Catina', mode: 'insensitive' } },
    select: {
      id: true, candidateName: true, candidateEmail: true, pipelineStatus: true,
      flowId: true,
    },
  })
  if (!session) { console.log('no Catina session found'); return }

  console.log('SESSION', session)

  const ws = await prisma.workspace.findUnique({
    where: { id: wsId }, select: { settings: true },
  })
  const stages = normalizeStages((ws?.settings as { funnelStages?: unknown } | null)?.funnelStages)
  console.log('\nSTAGES (id, order, label, triggers):')
  for (const s of stages) {
    console.log(`  [${s.order}] ${s.id.padEnd(40)} "${s.label}"  triggers=${JSON.stringify(s.triggers ?? [])}`)
  }

  const currentStage = stages.find(s => s.id === session.pipelineStatus)
  console.log(`\nCURRENT pipelineStatus="${session.pipelineStatus}"  → stage order=${currentStage?.order ?? 'unmapped'}  label="${currentStage?.label ?? '(no match)'}"`)

  const noShowStage = findStageForEvent(stages, 'meeting_no_show', { flowId: session.flowId ?? undefined })
  console.log(`\nWhich stage would meeting_no_show map to? ${noShowStage ? `[${noShowStage.order}] "${noShowStage.label}" (id=${noShowStage.id})` : '(NO STAGE CONFIGURED)'}`)

  if (currentStage && noShowStage) {
    if (noShowStage.order < currentStage.order) {
      console.log(`\n>>> BLOCKED: noShowStage.order (${noShowStage.order}) < currentStage.order (${currentStage.order}). Furthest-stage-wins guard refuses the move.`)
    } else {
      console.log(`\n>>> Should have moved (${currentStage.order} → ${noShowStage.order}).`)
    }
  }

  const meetings = await prisma.interviewMeeting.findMany({
    where: { sessionId: session.id },
    select: {
      id: true, scheduledStart: true, scheduledEnd: true, actualStart: true, actualEnd: true,
      recordingState: true, attendanceSheetFileId: true, driveGeminiNotesFileId: true,
      driveRecordingFileId: true, meetApiSyncedAt: true,
    },
  })
  console.log(`\nINTERVIEW MEETINGS (${meetings.length}):`)
  for (const m of meetings) console.log('  ', m)

  const events = await prisma.schedulingEvent.findMany({
    where: { sessionId: session.id, eventType: { in: ['meeting_scheduled', 'meeting_started', 'meeting_ended', 'meeting_no_show', 'attendance_uploaded'] } },
    orderBy: { eventAt: 'asc' },
    select: { eventType: true, eventAt: true, metadata: true },
  })
  console.log(`\nLIFECYCLE EVENTS (${events.length}):`)
  for (const e of events) console.log(`  ${e.eventAt.toISOString()}  ${e.eventType}  ${JSON.stringify(e.metadata)}`)

  const execs = await prisma.automationExecution.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'asc' },
    include: { automationRule: { select: { name: true, triggerType: true } } },
  })
  console.log(`\nAUTOMATION EXECUTIONS (${execs.length}):`)
  for (const e of execs) {
    console.log(`  ${e.createdAt.toISOString()}  rule="${e.automationRule?.name}" trigger=${e.automationRule?.triggerType} status=${e.status} channel=${e.channel} sentAt=${e.sentAt?.toISOString() ?? 'null'}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
