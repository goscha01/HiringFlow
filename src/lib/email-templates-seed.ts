// Shared default email templates. Used by:
//   - /api/email-templates/seed (bulk-create for a workspace)
//   - Content/Templates page (render as clickable starter tiles)
// Keep in sync with the UI list.

// Name of the template the candidate-page "Send reminder" button uses.
// Lives in DEFAULT_EMAIL_TEMPLATES so it gets seeded for new workspaces;
// the send-meeting-reminder endpoint also lazy-creates it on first use
// for workspaces that already pre-date this addition.
//
// For this one template, the `bodyText` field doubles as the SMS body —
// it's the editable copy sent to the candidate's phone when the recruiter
// clicks "Send reminder" on the candidate page. The plain-text email alt
// uses the same content (a short "join now" message reads fine in both).
// Other templates use bodyText as a normal plain-text email alternative.
export const MANUAL_MEETING_NUDGE_TEMPLATE_NAME = 'Meeting nudge — join now'

export interface DefaultEmailTemplate {
  name: string
  subject: string
  bodyHtml: string
  bodyText?: string
}

export const DEFAULT_EMAIL_TEMPLATES: DefaultEmailTemplate[] = [
  {
    name: 'Training Invitation',
    subject: 'Your training is ready, {{candidate_name}}!',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Great news! You\'ve passed the screening for {{flow_name}}.</p>\n<p><a href="{{training_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Start Training</a></p>',
  },
  {
    name: 'Scheduling Invitation',
    subject: 'Book your interview, {{candidate_name}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Congratulations on completing the training!</p>\n<p><a href="{{schedule_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Book Interview</a></p>',
  },
  {
    name: 'Scheduling Follow-up',
    subject: 'Reminder: book your interview, {{candidate_name}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Just a quick nudge — we haven\'t seen a booking yet for your <strong>{{flow_name}}</strong> interview.</p>\n<p>If you\'re still interested, pick a time that works for you below:</p>\n<p><a href="{{schedule_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Book Interview</a></p>\n<p>If you no longer want to move forward, no further action is needed.</p>\n<p>Talk soon,<br/>The Hiring Team</p>',
  },
  {
    name: 'Rejection Email',
    subject: 'Update on your application',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Thank you for your interest in {{flow_name}}. After careful review, we\'ve decided to move forward with other candidates.</p>\n<p>We wish you the best.</p>',
  },
  {
    name: 'Generic Follow-up',
    subject: 'Following up — {{flow_name}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Just checking in regarding your application for {{flow_name}}.</p>\n<p>If you have any questions, feel free to reply.</p>',
  },
  {
    name: 'Form Submit Confirmation',
    subject: 'We received your application, {{candidate_name}}!',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Thank you for completing your application for {{flow_name}}. We\'ve received all your information successfully.</p>\n<p>Our team will review your submission and get back to you shortly.</p>\n<p>Best regards,<br/>The Hiring Team</p>',
  },
  {
    name: 'Form Submit Notification',
    subject: 'New application received — {{flow_name}}',
    bodyHtml: '<p>A new candidate has submitted their application.</p>\n<p><strong>Name:</strong> {{candidate_name}}<br/><strong>Email:</strong> {{candidate_email}}<br/><strong>Phone:</strong> {{candidate_phone}}<br/><strong>Flow:</strong> {{flow_name}}<br/><strong>Source:</strong> {{source}}</p>\n<p>Reply to this email to contact the candidate directly. Or log in to your dashboard to review the submission.</p>',
  },
  {
    name: 'Next Step Email',
    subject: 'Next steps for {{flow_name}}, {{candidate_name}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Great progress on your application for {{flow_name}}! Here\'s what comes next:</p>\n<p>Please follow the link below to continue to the next stage of the process.</p>\n<p><a href="{{training_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Continue to Next Step</a></p>\n<p>If you have any questions, don\'t hesitate to reach out.</p>\n<p>Best,<br/>The Hiring Team</p>',
  },
  {
    name: 'Interview Confirmation',
    subject: 'Your interview is confirmed, {{candidate_name}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Your interview for <strong>{{flow_name}}</strong> is confirmed.</p>\n<p><strong>When:</strong> {{meeting_time}}</p>\n<p><strong>Join link:</strong> <a href="{{meeting_link}}">{{meeting_link}}</a></p>\n<p style="margin:24px 0"><a href="{{meeting_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Join Interview</a></p>\n<p>If you need to reschedule, please let us know as soon as possible.</p>\n<p>See you then,<br/>The Hiring Team</p>',
  },
  {
    name: 'Interview Reminder (24h)',
    subject: 'Reminder: Interview tomorrow — {{candidate_name}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Quick reminder that your interview is tomorrow.</p>\n<p><strong>When:</strong> {{meeting_time}}</p>\n<p><strong>Join link:</strong> <a href="{{meeting_link}}">{{meeting_link}}</a></p>\n<p>A few tips:</p>\n<ul>\n<li>Join from a quiet space with a good internet connection</li>\n<li>Test your camera and microphone beforehand</li>\n<li>Have any questions ready</li>\n</ul>\n<p>Looking forward to speaking with you!</p>\n<p>Best,<br/>The Hiring Team</p>',
  },
  {
    name: 'Interview Reminder',
    subject: 'Reminder: your interview is coming up — {{candidate_name}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>This is a reminder about your upcoming interview for <strong>{{flow_name}}</strong>.</p>\n<p><strong>When:</strong> {{meeting_time}}</p>\n<p><strong>Where:</strong> Google Meet</p>\n<p style="margin:24px 0"><a href="{{meeting_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Join Interview</a></p>\n<p>Direct link: <a href="{{meeting_link}}">{{meeting_link}}</a></p>\n<p>A few quick tips before you join:</p>\n<ul>\n<li>Find a quiet space with a steady internet connection</li>\n<li>Test your camera and microphone in advance</li>\n<li>Have any questions you want to ask ready</li>\n</ul>\n<p>If you can no longer make it, please <a href="{{schedule_link}}">reschedule here</a>.</p>\n<p>See you soon!<br/>The Hiring Team</p>',
  },
  {
    name: MANUAL_MEETING_NUDGE_TEMPLATE_NAME,
    subject: 'We\'re on the call waiting for you, {{candidate_name}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>We\'re on the call waiting for you to join your interview for <strong>{{flow_name}}</strong>.</p>\n<p style="margin:24px 0"><a href="{{meeting_link}}" style="background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Join now</a></p>\n<p>Direct link: <a href="{{meeting_link}}">{{meeting_link}}</a></p>\n<p>Scheduled for: {{meeting_time}}</p>\n<p>If something has come up, please reply and let us know.</p>\n<p>The Hiring Team</p>',
    // bodyText doubles as the SMS body for this template — keep it short
    // and include the meeting link.
    bodyText: 'Hi {{candidate_name}}, we\'re on the call waiting for you. Join: {{meeting_link}}',
  },
  {
    name: 'Interview Follow-up (Post-meeting)',
    subject: 'Thanks for the interview, {{candidate_name}}',
    bodyHtml: '<p>Hi {{candidate_name}},</p>\n<p>Thanks for taking the time to meet with us about <strong>{{flow_name}}</strong>. We appreciate the conversation.</p>\n<p>{{recording_status_note}}</p>\n<p><a href="{{recording_link}}">View recording</a> &nbsp;|&nbsp; <a href="{{transcript_link}}">View transcript</a></p>\n<p>We will be in touch with next steps shortly.</p>\n<p>Best,<br/>The Hiring Team</p>',
  },
]
