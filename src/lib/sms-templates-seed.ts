// Default SMS templates — one for each common email template the recruiter
// might want a phone-channel parallel to. Used by:
//   - /api/sms-templates/seed (bulk-create for a workspace)
//   - Assets / Templates page (render as clickable starter tiles)
//   - Automation editor SMS dropdown ("Add a default — one-click")
// Keep names aligned with DEFAULT_EMAIL_TEMPLATES where applicable so the
// recruiter can see the matched pair at a glance.

export interface DefaultSmsTemplate {
  name: string
  body: string
}

export const DEFAULT_SMS_TEMPLATES: DefaultSmsTemplate[] = [
  {
    name: 'Training Invitation',
    body: 'Hi {{candidate_name}}, you passed the screening for {{flow_name}}! Start your training: {{training_link}}',
  },
  {
    name: 'Scheduling Invitation',
    body: 'Hi {{candidate_name}}, training complete — pick an interview time: {{schedule_link}}',
  },
  {
    name: 'Scheduling Follow-up',
    body: 'Hi {{candidate_name}}, still want to interview for {{flow_name}}? Pick a time here: {{schedule_link}}',
  },
  {
    name: 'Rejection',
    body: 'Hi {{candidate_name}}, thanks for your interest in {{flow_name}}. We won\'t be moving forward at this time. Best of luck.',
  },
  {
    name: 'Generic Follow-up',
    body: 'Hi {{candidate_name}}, checking in regarding your application for {{flow_name}}. Reply with any questions.',
  },
  {
    name: 'Form Submit Confirmation',
    body: 'Hi {{candidate_name}}, thanks for applying to {{flow_name}}. We received your application and will be in touch soon.',
  },
  {
    name: 'Next Step',
    body: 'Hi {{candidate_name}}, ready for the next step of {{flow_name}}? Continue here: {{training_link}}',
  },
  {
    name: 'Interview Confirmation',
    body: 'Hi {{candidate_name}}, your interview for {{flow_name}} is confirmed for {{meeting_time}}. Join: {{meeting_link}}',
  },
  {
    name: 'Interview Reminder (24h)',
    body: 'Hi {{candidate_name}}, reminder: your interview is tomorrow at {{meeting_time}}. Join: {{meeting_link}}',
  },
  {
    name: 'Interview Reminder (1h)',
    body: 'Hi {{candidate_name}}, your interview starts in 1 hour at {{meeting_time}}. Join: {{meeting_link}}',
  },
  {
    name: 'Interview Reminder (15min)',
    body: 'Hi {{candidate_name}}, your interview starts in 15 minutes. Join: {{meeting_link}}',
  },
  {
    name: 'Meeting nudge — join now',
    body: 'Hi {{candidate_name}}, we\'re on the call waiting for you. Join: {{meeting_link}}',
  },
  {
    name: 'Interview Follow-up (Post-meeting)',
    body: 'Hi {{candidate_name}}, thanks for the interview today. We\'ll be in touch with next steps soon.',
  },
  {
    name: 'No-show — Re-book invite',
    body: 'Hi {{candidate_name}}, we missed you for the interview. Pick a new time when you\'re ready: {{schedule_link}}',
  },
  {
    name: 'YES/NO Confirm',
    body: 'Hi {{candidate_name}}, your interview is at {{meeting_time}}. Reply YES to confirm or NO to cancel.',
  },
]
