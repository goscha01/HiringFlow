/**
 * Diagnostic: why does the recruiter see a "Daphney Laloy" email
 * arriving FROM spotless.homes TO spotless.homes — without the
 * candidate's actual email visible in any header?
 *
 * Theory: an AutomationRule with a step where emailDestination='company'
 * (or a notification template like "Form Submit Notification") fired on
 * one of Daphney's sessions. In that path:
 *   from = workspace.senderEmail   (e.g. info@spotless.homes)
 *   to   = workspace.senderEmail   (same)
 * — the candidate's email never appears, only her name in the body.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1) Daphney's sessions
  const sessions = await prisma.session.findMany({
    where: { candidateName: { contains: 'Daphney', mode: 'insensitive' } },
    select: {
      id: true,
      workspaceId: true,
      flowId: true,
      candidateName: true,
      candidateEmail: true,
      candidatePhone: true,
      pipelineStatus: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      flow: { select: { name: true } },
    },
    orderBy: { startedAt: 'desc' },
  })

  console.log(`\n=== Daphney sessions: ${sessions.length} ===`)
  for (const s of sessions) {
    console.log(`  ${s.id}`)
    console.log(`    name=${s.candidateName}  email=${s.candidateEmail}  phone=${s.candidatePhone}`)
    console.log(`    flow="${s.flow?.name}"  status=${s.status}  pipeline=${s.pipelineStatus}`)
    console.log(`    startedAt=${s.startedAt.toISOString()}  finishedAt=${s.finishedAt?.toISOString() ?? '—'}`)
  }
  if (!sessions.length) { await prisma.$disconnect(); return }

  // 2) Workspace sender config
  for (const wsId of Array.from(new Set(sessions.map(s => s.workspaceId)))) {
    const ws = await prisma.workspace.findUnique({
      where: { id: wsId },
      select: {
        id: true, name: true,
        senderEmail: true, senderName: true, senderDomain: true,
        senderVerifiedAt: true, senderDomainValidatedAt: true,
      },
    })
    console.log(`\n=== Workspace ${ws?.name} (${wsId}) ===`)
    console.log(`  senderEmail        = ${ws?.senderEmail}`)
    console.log(`  senderName         = ${ws?.senderName}`)
    console.log(`  senderDomain       = ${ws?.senderDomain}`)
    console.log(`  senderVerifiedAt   = ${ws?.senderVerifiedAt?.toISOString() ?? '—'}`)
    console.log(`  domainValidatedAt  = ${ws?.senderDomainValidatedAt?.toISOString() ?? '—'}`)
  }

  // 3) Recent automation executions for these sessions — anything with
  //    emailDestination='company' is a sender→sender email by definition.
  const sessionIds = sessions.map(s => s.id)
  const execs = await prisma.automationExecution.findMany({
    where: { sessionId: { in: sessionIds } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      step: {
        select: {
          id: true, order: true, channel: true,
          emailDestination: true, emailDestinationAddress: true,
          emailTemplate: { select: { name: true, subject: true } },
        },
      },
      automationRule: { select: { id: true, name: true, triggerType: true } },
    },
  })

  console.log(`\n=== Automation executions for Daphney's sessions: ${execs.length} ===`)
  for (const e of execs) {
    const dest = e.step?.emailDestination ?? '—'
    const tmpl = e.step?.emailTemplate?.name ?? '—'
    console.log(`  ${e.createdAt.toISOString()}  rule="${e.automationRule?.name}"  trig=${e.automationRule?.triggerType}`)
    console.log(`    step.order=${e.step?.order}  ch=${e.channel}  dest=${dest}  tmpl="${tmpl}"`)
    console.log(`    status=${e.status}  err=${e.errorMessage ?? '—'}  msgId=${e.providerMessageId ?? '—'}  sentAt=${e.sentAt?.toISOString() ?? '—'}`)
  }

  // 4) Highlight any company-destination email executions specifically
  const companyEmails = execs.filter(e => e.channel === 'email' && e.step?.emailDestination === 'company' && e.status === 'sent')
  console.log(`\n=== Sender→sender notifications (emailDestination='company', sent): ${companyEmails.length} ===`)
  for (const e of companyEmails) {
    console.log(`  ${e.sentAt?.toISOString()}  rule="${e.automationRule?.name}"  template="${e.step?.emailTemplate?.name}"  subject="${e.step?.emailTemplate?.subject}"  msgId=${e.providerMessageId}`)
  }

  // 5) Show ALL rules in the workspace whose steps target 'company' — so
  //    even if the execution rolled off, we know what could have fired.
  const wsIds = Array.from(new Set(sessions.map(s => s.workspaceId)))
  const companyRules = await prisma.automationRule.findMany({
    where: {
      workspaceId: { in: wsIds },
      steps: { some: { emailDestination: 'company' } },
    },
    select: {
      id: true, name: true, triggerType: true, isActive: true,
      steps: {
        where: { emailDestination: 'company' },
        select: { order: true, channel: true, emailTemplate: { select: { name: true, subject: true } } },
      },
    },
  })
  console.log(`\n=== Rules with company-destination steps: ${companyRules.length} ===`)
  for (const r of companyRules) {
    console.log(`  rule="${r.name}"  trig=${r.triggerType}  active=${r.isActive}`)
    for (const st of r.steps) {
      console.log(`    step ${st.order}  ch=${st.channel}  tmpl="${st.emailTemplate?.name}"  subject="${st.emailTemplate?.subject}"`)
    }
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
