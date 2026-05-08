/**
 * Diagnostic: why didn't the background-check message reach Stephanie
 * Descofleur after a manual trigger?
 *
 * Reproduces the run-stage-automations matcher to show exactly what would
 * have fired if the recruiter clicked "Run automations" while Stephanie sat
 * on stage_8_2 (Background check).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const SESSION_ID = '8f8732ba-75e4-4153-9ee3-06fdaf8ec094'

async function main() {
  const session = await prisma.session.findUnique({
    where: { id: SESSION_ID },
    select: {
      id: true,
      workspaceId: true,
      flowId: true,
      candidateName: true,
      candidateEmail: true,
      candidatePhone: true,
      pipelineStatus: true,
      status: true,
      dispositionReason: true,
      stalledAt: true,
      lastActivityAt: true,
      startedAt: true,
    },
  })
  if (!session) { console.log('Session not found'); return }
  console.log('=== Session ===')
  console.log(JSON.stringify(session, null, 2))

  console.log('\n=== Background checks ===')
  const checks = await prisma.backgroundCheck.findMany({
    where: { sessionId: SESSION_ID },
    orderBy: { createdAt: 'desc' },
  })
  console.log(checks.length === 0 ? '(none)' : JSON.stringify(checks, null, 2))

  console.log('\n=== Workspace + funnelStages[stage_8_2] ===')
  const ws = await prisma.workspace.findUnique({
    where: { id: session.workspaceId },
    select: { id: true, name: true, settings: true, senderEmail: true, phone: true },
  })
  console.log('workspace:', ws?.name, ws?.id)
  console.log('senderEmail:', ws?.senderEmail, '  phone:', ws?.phone)
  const stages: any[] = (ws?.settings as any)?.funnelStages ?? []
  const stage = stages.find((s) => s.id === session.pipelineStatus)
  console.log(`current stage (${session.pipelineStatus}):`, JSON.stringify(stage, null, 2))

  console.log('\n=== Has CertnIntegration? ===')
  const certn = await prisma.certnIntegration.findUnique({
    where: { workspaceId: session.workspaceId },
    select: { id: true, region: true, useSandbox: true, isActive: true, createdAt: true, updatedAt: true },
  }).catch((e) => ({ error: String(e).split('\n')[0] } as any))
  console.log(certn ? JSON.stringify(certn, null, 2) : '(no CertnIntegration row → "Order check" would fail with config_error)')

  console.log('\n=== Recent AutomationExecution (last 24h) ===')
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const execs = await prisma.automationExecution.findMany({
    where: { sessionId: SESSION_ID, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    include: {
      step: { select: { id: true, order: true, channel: true } },
      automationRule: { select: { id: true, name: true, triggerType: true } },
    },
  })
  if (execs.length === 0) console.log('(no executions in last 24h)')
  else execs.forEach((e) => console.log(`${e.createdAt.toISOString()}  ${e.status.padEnd(10)}  ${e.channel.padEnd(5)}  rule="${e.automationRule.name}" (${e.automationRule.triggerType})  ${e.errorMessage ? '⚠ ' + e.errorMessage : ''}`))

  // ─── Reproduce findMatchingRules (run-stage-automations route) ────────────
  console.log('\n=== Matcher: which rules would fire from "Run automations" on this stage? ===')
  const events: string[] = Array.from(new Set((stage?.triggers ?? []).map((t: any) => t.event)))
  console.log('stage trigger events:', events)
  const stageMatch: any[] = [
    { stageId: session.pipelineStatus },
    ...(events.length > 0 ? [{ stageId: null, triggerType: { in: events } }] : []),
  ]
  const matched = await prisma.automationRule.findMany({
    where: {
      workspaceId: session.workspaceId,
      isActive: true,
      AND: [
        { OR: stageMatch },
        { OR: [{ flowId: session.flowId }, { flowId: null }] },
      ],
    },
    select: {
      id: true, name: true, triggerType: true, stageId: true, flowId: true, isActive: true,
      steps: {
        select: { id: true, order: true, channel: true, emailTemplateId: true, smsBody: true, emailDestination: true, smsDestination: true, emailDestinationAddress: true, smsDestinationNumber: true, emailTemplate: { select: { name: true } } },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`matched ${matched.length} rule(s):`)
  console.log(JSON.stringify(matched, null, 2))

  // ─── All workspace rules with stageId === stage_8_2 OR background_check trigger ─
  console.log('\n=== ALL rules in this workspace with stageId=stage_8_2 OR background_check_* trigger (regardless of flow / active) ===')
  const all = await prisma.automationRule.findMany({
    where: {
      workspaceId: session.workspaceId,
      OR: [
        { stageId: session.pipelineStatus },
        { triggerType: { startsWith: 'background_check' } },
      ],
    },
    select: { id: true, name: true, triggerType: true, isActive: true, flowId: true, stageId: true },
  })
  console.log(JSON.stringify(all, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
