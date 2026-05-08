/**
 * Add {{candidate_email}} / {{candidate_phone}} merge tokens to the
 * Spotless Homes "Form Submit Notification" + "Training done notification"
 * templates so the recruiter actually sees who the notification is about.
 *
 * Usage:
 *   set -a && source .env.diagnose && set +a
 *   npx tsx scripts/update-spotless-notification-templates.ts          # dry-run
 *   npx tsx scripts/update-spotless-notification-templates.ts --apply  # write
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const WORKSPACE_ID = '739bcd71-69fd-4b30-a39e-242521b7ab20' // Spotless Homes Florida LLC

const TARGETS: Array<{ name: string; bodyHtml: string; bodyText: string; subject?: string }> = [
  {
    name: 'Form Submit Notification',
    subject: 'New application received — {{flow_name}}',
    bodyHtml:
      '<p>A new candidate has submitted their application.</p>\n' +
      '<p><strong>Name:</strong> {{candidate_name}}<br/>' +
      '<strong>Email:</strong> {{candidate_email}}<br/>' +
      '<strong>Phone:</strong> {{candidate_phone}}<br/>' +
      '<strong>Flow:</strong> {{flow_name}}<br/>' +
      '<strong>Source:</strong> {{source}}</p>\n' +
      '<p>Reply to this email to contact the candidate directly. Or log in to your dashboard to review the submission.</p>',
    bodyText:
      'New application received\n\n' +
      'Name: {{candidate_name}}\n' +
      'Email: {{candidate_email}}\n' +
      'Phone: {{candidate_phone}}\n' +
      'Flow: {{flow_name}}\n' +
      'Source: {{source}}\n\n' +
      'Reply to this email to contact the candidate directly.',
  },
  {
    name: 'Training done notification',
    bodyHtml:
      '<p>{{candidate_name}} just finished their training for <strong>{{flow_name}}</strong>.</p>\n' +
      '<p><strong>Email:</strong> {{candidate_email}}<br/>' +
      '<strong>Phone:</strong> {{candidate_phone}}</p>\n' +
      '<p>Reply to this email to contact the candidate directly. Or log in to your dashboard to review.</p>',
    bodyText:
      '{{candidate_name}} just finished training for {{flow_name}}.\n\n' +
      'Email: {{candidate_email}}\n' +
      'Phone: {{candidate_phone}}\n\n' +
      'Reply to this email to contact the candidate directly.',
  },
]

async function main() {
  for (const t of TARGETS) {
    const tmpl = await prisma.emailTemplate.findFirst({
      where: { workspaceId: WORKSPACE_ID, name: t.name },
      select: { id: true, name: true, subject: true, bodyHtml: true, bodyText: true },
    })
    if (!tmpl) {
      console.log(`\n[skip] template "${t.name}" not found in workspace ${WORKSPACE_ID}`)
      continue
    }
    console.log(`\n=== "${tmpl.name}" (${tmpl.id}) ===`)
    console.log('--- current bodyHtml ---')
    console.log(tmpl.bodyHtml)
    console.log('--- new bodyHtml ---')
    console.log(t.bodyHtml)

    if (APPLY) {
      const data: { bodyHtml: string; bodyText: string; subject?: string } = {
        bodyHtml: t.bodyHtml,
        bodyText: t.bodyText,
      }
      if (t.subject) data.subject = t.subject
      await prisma.emailTemplate.update({ where: { id: tmpl.id }, data })
      console.log(`[apply] updated "${tmpl.name}"`)
    } else {
      console.log('[dry-run] pass --apply to write')
    }
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
