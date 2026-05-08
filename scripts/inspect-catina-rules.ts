import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const SID = 'dc095992-adbc-4035-b8da-6088b0649195'
;(async () => {
  // 1. Look up the two automation rules that fired (after-meeting + no-show follow-up).
  const ruleIds = ['ad945008-8598-4356-a51b-8ed630556031', 'd91cf094-8cf6-45a7-a19e-89c1adf066f6']
  for (const id of ruleIds) {
    const r = await prisma.automationRule.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: 'asc' } } },
    })
    if (!r) { console.log(`rule ${id}: NOT FOUND`); continue }
    console.log(`\nrule  : ${r.name}`)
    console.log(`  id           : ${r.id}`)
    console.log(`  triggerType  : ${r.triggerType}`)
    console.log(`  isActive     : ${r.isActive}`)
    console.log(`  flowId       : ${r.flowId}`)
    console.log(`  trainingId   : ${r.trainingId}`)
    console.log(`  stageId      : ${r.stageId}`)
    console.log(`  steps:`)
    for (const s of r.steps) {
      console.log(`    [${s.order}] channel=${s.channel} delay=${s.delayMinutes}m timing=${s.timingMode ?? 'trigger'} nextStep=${s.nextStepType} next=${s.schedulingConfigId ?? s.trainingId ?? s.nextStepUrl ?? '—'}`)
    }
  }

  // 2. Pull every SchedulingEvent for Catina to make sure we see all (including meeting_no_show if any).
  const allEvents = await prisma.schedulingEvent.findMany({
    where: { sessionId: SID },
    orderBy: { eventAt: 'asc' },
    select: { eventType: true, eventAt: true, metadata: true },
  })
  console.log(`\nALL schedulingEvents for Catina (${allEvents.length}):`)
  for (const e of allEvents) {
    console.log(`  ${e.eventAt.toISOString()}  ${e.eventType}  ${JSON.stringify(e.metadata).slice(0, 220)}`)
  }

  // 3. AutomationExecutions for this session — confirms which rules actually fired and when.
  const execs = await prisma.automationExecution.findMany({
    where: { sessionId: SID },
    orderBy: { createdAt: 'asc' },
    include: { automationRule: { select: { name: true, triggerType: true, stageId: true } } },
  })
  console.log(`\nautomationExecutions for Catina (${execs.length}):`)
  for (const x of execs) {
    console.log(`  ${x.createdAt.toISOString()}  status=${x.status}  channel=${x.channel}  rule=${x.automationRule?.name}  trigger=${x.automationRule?.triggerType}  stageId=${x.automationRule?.stageId ?? '—'}`)
  }

  await prisma.$disconnect()
})()
