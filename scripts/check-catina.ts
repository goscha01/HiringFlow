import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const wsId = '739bcd71-69fd-4b30-a39e-242521b7ab20'
  const flowId = 'df8473ec-166d-48ae-a3dc-d7b30bf9061c'
  const rules = await prisma.automationRule.findMany({
    where: {
      workspaceId: wsId,
      isActive: true,
      triggerType: { in: ['before_meeting', 'meeting_no_show'] },
      OR: [{ flowId }, { flowId: null }],
    },
    select: {
      id: true, name: true, triggerType: true,
      steps: {
        orderBy: { order: 'asc' },
        select: {
          id: true, channel: true, smsBody: true,
          emailDestination: true, emailDestinationAddress: true,
          emailTemplate: { select: { name: true, subject: true, bodyText: true, bodyHtml: true } },
        },
      },
    },
  })
  for (const r of rules) {
    console.log('═'.repeat(70))
    console.log(`RULE: ${r.name}  [${r.triggerType}]`)
    for (const s of r.steps) {
      console.log(`  STEP channel=${s.channel} dest=${s.emailDestination}${s.emailDestinationAddress ? `(${s.emailDestinationAddress})` : ''}`)
      if (s.channel !== 'sms' && s.emailTemplate) {
        console.log(`  EMAIL "${s.emailTemplate.name}"`)
        console.log(`  Subject: ${s.emailTemplate.subject}`)
        console.log(`  --- bodyText ---`)
        console.log(s.emailTemplate.bodyText || '(none)')
      }
      if (s.channel !== 'email' && s.smsBody) {
        console.log(`  --- smsBody ---`)
        console.log(s.smsBody)
      }
      console.log()
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
