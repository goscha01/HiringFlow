/**
 * Backfill AutomationStep from existing AutomationRule rows. Each rule becomes
 * a single step at order=0, copying its prior channel/body/template/destination/
 * next-step config. Existing AutomationExecution rows are linked to that step
 * via stepId.
 *
 * Idempotent: rules that already have at least one step are skipped, and
 * executions that already have stepId set are left alone.
 *
 * Run AFTER `prisma db push` has applied the new AutomationStep model and the
 * stepId column on AutomationExecution.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rules = await prisma.automationRule.findMany({
    select: {
      id: true,
      channel: true,
      emailTemplateId: true,
      smsBody: true,
      emailDestination: true,
      emailDestinationAddress: true,
      nextStepType: true,
      nextStepUrl: true,
      trainingId: true,
      schedulingConfigId: true,
      delayMinutes: true,
      steps: { select: { id: true }, take: 1 },
    },
  })

  let createdSteps = 0
  let linkedExecutions = 0
  let skippedRules = 0

  for (const rule of rules) {
    if (rule.steps.length > 0) {
      skippedRules++
      continue
    }

    const step = await prisma.automationStep.create({
      data: {
        ruleId: rule.id,
        order: 0,
        delayMinutes: rule.delayMinutes ?? 0,
        channel: rule.channel || 'email',
        emailTemplateId: rule.emailTemplateId,
        smsBody: rule.smsBody,
        emailDestination: rule.emailDestination || 'applicant',
        emailDestinationAddress: rule.emailDestinationAddress,
        nextStepType: rule.nextStepType,
        nextStepUrl: rule.nextStepUrl,
        trainingId: rule.trainingId,
        schedulingConfigId: rule.schedulingConfigId,
      },
    })
    createdSteps++

    // Link existing executions to the new step. We can't filter on stepId=null
    // generically until the column exists; use updateMany with a where clause
    // that targets only rows currently lacking a step assignment.
    const { count } = await prisma.automationExecution.updateMany({
      where: { automationRuleId: rule.id, stepId: null },
      data: { stepId: step.id },
    })
    linkedExecutions += count
  }

  console.log(
    `[migrate-automation-steps] rules=${rules.length} createdSteps=${createdSteps} skippedExisting=${skippedRules} linkedExecutions=${linkedExecutions}`,
  )
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
