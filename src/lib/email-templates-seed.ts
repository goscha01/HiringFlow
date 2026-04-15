// Shared default email templates. Used by:
//   - /api/email-templates/seed (bulk-create for a workspace)
//   - Content/Templates page (render as clickable starter tiles)
// Keep in sync with the UI list.

export const DEFAULT_EMAIL_TEMPLATES = [
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
    bodyHtml: '<p>A new candidate has submitted their application.</p>\n<p><strong>Name:</strong> {{candidate_name}}<br/><strong>Flow:</strong> {{flow_name}}<br/><strong>Source:</strong> {{source}}</p>\n<p>Log in to your dashboard to review the submission.</p>',
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
]
