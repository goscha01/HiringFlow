// Wrappers for SendGrid's Domain Authentication API (whitelabel domains)
// https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication

const API = 'https://api.sendgrid.com/v3'

function key() {
  const k = process.env.SENDGRID_API_KEY
  if (!k) throw new Error('SENDGRID_API_KEY not configured')
  return k
}

export interface DnsRecord {
  host: string
  type: string
  data: string
  valid: boolean
}

export interface WhitelabelDomain {
  id: number
  domain: string
  subdomain: string
  valid: boolean
  dns: {
    mail_cname?: DnsRecord
    dkim1?: DnsRecord
    dkim2?: DnsRecord
    spf?: DnsRecord
  }
}

// Create the domain — SendGrid returns the CNAMEs the user must add.
// `subdomain` lets us scope SendGrid's DKIM/MX records under a prefix
// like "em" or "mail", avoiding collisions with existing DKIM records
// from other providers (Outlook, Google Workspace, Wix, etc.).
export async function authenticateDomain(domain: string, subdomain?: string): Promise<WhitelabelDomain> {
  const res = await fetch(`${API}/whitelabel/domains`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      domain,
      ...(subdomain ? { subdomain } : {}),
      automatic_security: true,
      custom_dkim_selector: 'sg', // Use sg1/sg2 instead of s1/s2 to avoid DKIM conflicts with Outlook/Wix/Google
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.errors?.[0]?.message || err?.error || `SendGrid API ${res.status}`
    throw new Error(msg)
  }
  return res.json()
}

export async function getDomain(id: string): Promise<WhitelabelDomain | null> {
  const res = await fetch(`${API}/whitelabel/domains/${id}`, {
    headers: { 'Authorization': `Bearer ${key()}` },
  })
  if (res.status === 404) return null
  if (!res.ok) return null
  return res.json()
}

// Ask SendGrid to re-validate the DNS CNAMEs the user should have added.
export async function validateDomain(id: string): Promise<{ valid: boolean; validationResults: unknown }> {
  const res = await fetch(`${API}/whitelabel/domains/${id}/validate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key()}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.errors?.[0]?.message || `SendGrid API ${res.status}`)
  }
  const data = await res.json()
  return { valid: !!data.valid, validationResults: data.validation_results }
}

export async function deleteDomain(id: string): Promise<void> {
  const res = await fetch(`${API}/whitelabel/domains/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${key()}` },
  })
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.errors?.[0]?.message || `SendGrid API ${res.status}`)
  }
}

export function extractCnames(domain: WhitelabelDomain): Array<{ host: string; value: string; purpose: string }> {
  const out: Array<{ host: string; value: string; purpose: string }> = []
  const dns = domain.dns || {}
  if (dns.mail_cname) out.push({ host: dns.mail_cname.host, value: dns.mail_cname.data, purpose: 'Mail routing' })
  if (dns.dkim1) out.push({ host: dns.dkim1.host, value: dns.dkim1.data, purpose: 'DKIM signing (key 1)' })
  if (dns.dkim2) out.push({ host: dns.dkim2.host, value: dns.dkim2.data, purpose: 'DKIM signing (key 2)' })
  return out
}
