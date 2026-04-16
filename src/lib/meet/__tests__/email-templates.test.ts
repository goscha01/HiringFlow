import { describe, it, expect } from 'vitest'
import { DEFAULT_EMAIL_TEMPLATES } from '../../email-templates-seed'

describe('email templates — Meet integration v2', () => {
  it('includes the post-meeting follow-up template with recording + transcript vars', () => {
    const tpl = DEFAULT_EMAIL_TEMPLATES.find((t) => t.name === 'Interview Follow-up (Post-meeting)')
    expect(tpl).toBeTruthy()
    expect(tpl!.bodyHtml).toContain('{{recording_link}}')
    expect(tpl!.bodyHtml).toContain('{{transcript_link}}')
    expect(tpl!.bodyHtml).toContain('{{recording_status_note}}')
    expect(tpl!.bodyHtml).toContain('{{candidate_name}}')
  })

  it('keeps the existing Interview Confirmation + Reminder templates intact', () => {
    const confirm = DEFAULT_EMAIL_TEMPLATES.find((t) => t.name === 'Interview Confirmation')
    expect(confirm).toBeTruthy()
    expect(confirm!.bodyHtml).toContain('{{meeting_link}}')
    expect(confirm!.bodyHtml).toContain('{{meeting_time}}')

    const reminder = DEFAULT_EMAIL_TEMPLATES.find((t) => t.name === 'Interview Reminder (24h)')
    expect(reminder).toBeTruthy()
    expect(reminder!.bodyHtml).toContain('{{meeting_link}}')
  })
})
