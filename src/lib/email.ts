import sgMail from '@sendgrid/mail'

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@hirefunnel.app'
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'HireFunnel'

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY)
}

export interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!SENDGRID_API_KEY) {
    console.warn('[Email] SendGrid not configured — skipping send')
    return { success: false, error: 'SendGrid not configured' }
  }

  try {
    const [response] = await sgMail.send({
      to: payload.to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: payload.subject,
      html: payload.html,
      text: payload.text || undefined,
    })

    const messageId = response.headers['x-message-id'] as string || undefined
    console.log('[Email] Sent to', payload.to, 'messageId:', messageId)
    return { success: true, messageId }
  } catch (error: any) {
    const message = error?.response?.body?.errors?.[0]?.message || error?.message || 'Unknown error'
    console.error('[Email] Failed to send to', payload.to, ':', message)
    return { success: false, error: message }
  }
}

// Template variable replacement
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? ''
  })
}
