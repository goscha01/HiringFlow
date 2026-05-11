import { detectAutomationWarnings } from '../src/lib/automation-warnings'

const cases = [
  {
    label: 'Test George rule (the actual misconfiguration)',
    rule: {
      triggerType: 'before_meeting',
      steps: [{ channel: 'sms', smsBody: 'Hi {{candidate_name}}, reminder: your interview rescheduled at {{meeting_time}}. Join: {{meeting_link}}' }],
    },
    expectWarning: true,
  },
  {
    label: 'Same body but correct trigger',
    rule: {
      triggerType: 'meeting_rescheduled',
      steps: [{ channel: 'sms', smsBody: 'Hi {{candidate_name}}, your interview was rescheduled to {{meeting_time}}.' }],
    },
    expectWarning: false,
  },
  {
    label: 'Normal 1h-before reminder (no warning)',
    rule: {
      triggerType: 'before_meeting',
      steps: [{ channel: 'sms', smsBody: 'Hi {{candidate_name}}, your interview starts in 1 hour. Join: {{meeting_link}}' }],
    },
    expectWarning: false,
  },
  {
    label: 'Post-meeting follow-up wired to meeting_scheduled (mistake)',
    rule: {
      triggerType: 'meeting_scheduled',
      steps: [{ channel: 'email', emailTemplate: { subject: 'Thanks for the interview, {{candidate_name}}' } }],
    },
    expectWarning: true,
  },
  {
    label: 'Post-meeting follow-up wired to meeting_ended (correct)',
    rule: {
      triggerType: 'meeting_ended',
      steps: [{ channel: 'email', emailTemplate: { subject: 'Thanks for the interview, {{candidate_name}}' } }],
    },
    expectWarning: false,
  },
  {
    label: 'No-show note wired to meeting_ended (mistake)',
    rule: {
      triggerType: 'meeting_ended',
      steps: [{ channel: 'email', emailTemplate: { subject: 'We missed you — pick a new interview time' } }],
    },
    expectWarning: true,
  },
  {
    label: 'No-show note wired correctly',
    rule: {
      triggerType: 'meeting_no_show',
      steps: [{ channel: 'email', emailTemplate: { subject: 'We missed you — pick a new interview time' } }],
    },
    expectWarning: false,
  },
  {
    label: 'flow_completed thank-you (legit, should NOT match "thanks for")',
    rule: {
      triggerType: 'flow_completed',
      steps: [{ channel: 'sms', smsBody: 'Hi {{candidate_name}}, thanks for applying to {{flow_name}}.' }],
    },
    expectWarning: false,
  },
  {
    label: 'The ttest1 case: rule named "Flow Completed follow-up", trigger=before_meeting, subject=application received',
    rule: {
      triggerType: 'before_meeting',
      name: 'Flow Completed follow-up ttest1',
      steps: [{ channel: 'email', emailTemplate: { subject: 'We received your application, {{candidate_name}}!' } }],
    },
    expectWarning: true,
  },
  {
    label: 'Same body but correct flow_completed trigger',
    rule: {
      triggerType: 'flow_completed',
      name: 'Flow Completed follow-up',
      steps: [{ channel: 'email', emailTemplate: { subject: 'We received your application, {{candidate_name}}!' } }],
    },
    expectWarning: false,
  },
  {
    label: 'Training-completion message wired to flow_completed (mistake)',
    rule: {
      triggerType: 'flow_completed',
      steps: [{ channel: 'email', emailTemplate: { subject: 'You completed the training, {{candidate_name}}' } }],
    },
    expectWarning: true,
  },
  {
    label: '"Book your interview" wired to before_meeting (mistake — should be training_completed or flow_completed)',
    rule: {
      triggerType: 'before_meeting',
      steps: [{ channel: 'email', emailTemplate: { subject: 'Book your interview, {{candidate_name}}' } }],
    },
    expectWarning: true,
  },
  {
    label: 'Pre-meeting reminder wired to meeting_ended (mistake)',
    rule: {
      triggerType: 'meeting_ended',
      steps: [{ channel: 'sms', smsBody: 'Hi {{candidate_name}}, your interview starts in 15 minutes.' }],
    },
    expectWarning: true,
  },
]

let failed = 0
for (const c of cases) {
  const got = detectAutomationWarnings(c.rule as Parameters<typeof detectAutomationWarnings>[0])
  const ok = (got.length > 0) === c.expectWarning
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.label}`)
  if (!ok) {
    console.log(`        expected warning=${c.expectWarning}, got ${got.length} warning(s):`)
    for (const w of got) console.log(`          - ${w}`)
    failed++
  } else if (got.length > 0) {
    for (const w of got) console.log(`        ↳ ${w}`)
  }
}
console.log(`\n${failed === 0 ? 'All passed.' : `${failed} FAILED`}`)
process.exit(failed === 0 ? 0 : 1)
