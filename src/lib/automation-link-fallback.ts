/**
 * Append a CTA button to an email/SMS body when the recruiter set
 * `Includes link to: X` on a step but the chosen template body doesn't
 * actually reference the corresponding merge token (e.g. picks
 * "Training" but the template doesn't contain {{training_link}}).
 *
 * The link is generated server-side regardless — without this fallback
 * it would simply not appear in the rendered message, surprising the
 * recruiter. The rule editor also surfaces an inline warning when this
 * mismatch is detected, but we still need the fallback so existing
 * rules don't silently send linkless emails.
 *
 * Behavior:
 *  - HTML: append a styled CTA button matching the brand colour.
 *  - Plain-text: append "Label: <url>" on a new paragraph.
 *  - SMS: append "Label: <url>" on a new line (only when channel='sms').
 *  - If the body already contains the literal URL, nothing is appended
 *    (the user/template handled it explicitly).
 */

export type LinkKind = 'training' | 'scheduling' | 'meet_link'

const LABELS: Record<LinkKind, { html: string; plain: string }> = {
  training:   { html: 'Continue to next step', plain: 'Continue' },
  scheduling: { html: 'Book your interview',   plain: 'Book interview' },
  meet_link:  { html: 'Join interview',         plain: 'Join interview' },
}

const BUTTON_STYLE = 'background:#FF9500;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;'

export function appendLinkToHtml(html: string, kind: LinkKind, url: string): string {
  if (!url) return html
  if (html.includes(url)) return html
  const label = LABELS[kind].html
  return html + `\n<p style="margin-top:24px"><a href="${url}" style="${BUTTON_STYLE}">${label}</a></p>`
}

export function appendLinkToPlain(text: string, kind: LinkKind, url: string): string {
  if (!url) return text
  if (text.includes(url)) return text
  const label = LABELS[kind].plain
  return text ? `${text}\n\n${label}: ${url}` : `${label}: ${url}`
}

export function appendLinkToSms(body: string, kind: LinkKind, url: string): string {
  if (!url) return body
  if (body.includes(url)) return body
  const label = LABELS[kind].plain
  return body ? `${body}\n${label}: ${url}` : `${label}: ${url}`
}
