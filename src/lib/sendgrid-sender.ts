// Wrappers for SendGrid's Verified Sender Identity API
// https://www.twilio.com/docs/sendgrid/api-reference/sender-identities-api

const API = 'https://api.sendgrid.com/v3'

function key() {
  const k = process.env.SENDGRID_API_KEY
  if (!k) throw new Error('SENDGRID_API_KEY not configured')
  return k
}

export interface SenderAddress {
  line1: string
  line2?: string
  city: string
  state: string
  zip: string
  country: string
}

export interface VerifiedSender {
  id: string
  nickname: string
  from_email: string
  from_name: string
  reply_to: string
  reply_to_name: string
  verified: boolean
  locked: boolean
  created_at: number
  updated_at: number
}

export async function createVerifiedSender(opts: {
  workspaceName: string
  email: string
  name: string
  address: SenderAddress
}): Promise<VerifiedSender> {
  const res = await fetch(`${API}/verified_senders`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nickname: `${opts.workspaceName} — ${opts.email}`.slice(0, 48),
      from_email: opts.email,
      from_name: opts.name,
      reply_to: opts.email,
      reply_to_name: opts.name,
      address: opts.address.line1,
      address_2: opts.address.line2 || '',
      city: opts.address.city,
      state: opts.address.state,
      zip: opts.address.zip,
      country: opts.address.country,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.errors?.[0]?.message || err?.error || `SendGrid API ${res.status}`
    throw new Error(msg)
  }
  return res.json()
}

export async function getVerifiedSender(id: string): Promise<VerifiedSender | null> {
  // SendGrid doesn't have a by-id endpoint — list all and find
  const res = await fetch(`${API}/verified_senders`, {
    headers: { 'Authorization': `Bearer ${key()}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return (data.results || []).find((s: VerifiedSender) => String(s.id) === String(id)) || null
}

export async function resendVerification(id: string): Promise<void> {
  const res = await fetch(`${API}/verified_senders/resend/${id}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key()}` },
  })
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.errors?.[0]?.message || `SendGrid API ${res.status}`)
  }
}

export async function deleteVerifiedSender(id: string): Promise<void> {
  const res = await fetch(`${API}/verified_senders/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${key()}` },
  })
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.errors?.[0]?.message || `SendGrid API ${res.status}`)
  }
}
