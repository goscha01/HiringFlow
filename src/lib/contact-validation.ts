/**
 * Pure, client-safe validators for candidate email and phone input.
 * Used by candidate-facing forms (/f/[slug], /a/[slug]) on the client
 * for inline feedback, and by /api/public/sessions on the server as the
 * authoritative gate (a hostile client could bypass the JS check).
 *
 * Phone validation delegates to the same E.164 normalization the SMS
 * sender uses so anything that passes here is guaranteed to be a
 * shape Twilio/Sigcore will accept.
 */

// Permissive RFC-style check. Not a full RFC 5322 grammar — that's
// overkill and rejects valid edge cases people actually use. This catches
// the failure modes we see in real candidate input: missing @,
// missing dot in domain, trailing characters after the TLD (e.g.
// "foo@gmail.comd"), spaces, double dots.
//
//  - one or more chars before @ (no whitespace, no @, no consecutive dots)
//  - exactly one @
//  - one or more chars in domain (no whitespace)
//  - at least one dot in the domain part
//  - TLD is 2-24 letters/digits — locks the trailing-d / trailing-comma
//    typos out without rejecting newer TLDs like .photography
const EMAIL_RE = /^(?!.*\.\.)[A-Za-z0-9._%+\-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/

// Common TLD typos → suggested correct TLD. We can't enumerate every
// valid TLD (new gTLDs appear), but we CAN catch the typos that
// actually show up in candidate input. Daphney's "@gmail.comd" is the
// originating example; the rest are extrapolated from frequent
// fat-finger patterns ("comm", "con", "cmo", trailing punctuation).
const TLD_TYPOS: Record<string, string> = {
  comd: 'com', comm: 'com', cmo: 'com', cm: 'com', coom: 'com',
  con: 'com', vom: 'com', xom: 'com', dom: 'com', xon: 'com',
  ccom: 'com', cim: 'com', clm: 'com',
  nett: 'net', nte: 'net',
  orgg: 'org', ogr: 'org',
}

const E164 = /^\+[1-9]\d{6,14}$/

export function normalizeEmail(input: string | null | undefined): string {
  return (input ?? '').trim().toLowerCase()
}

export function validateEmail(input: string | null | undefined): { ok: true; value: string } | { ok: false; error: string } {
  const v = normalizeEmail(input)
  if (!v) return { ok: false, error: 'Email is required' }
  if (!EMAIL_RE.test(v)) return { ok: false, error: 'Enter a valid email address (e.g. you@example.com)' }
  // Catch common TLD typos that the regex above can't (since "comd"
  // passes the 2-24 letter rule). The candidate gets a "did you mean"
  // hint so they can self-correct without recruiter intervention.
  const tldMatch = /\.([A-Za-z]+)$/.exec(v)
  const tld = tldMatch ? tldMatch[1].toLowerCase() : null
  if (tld && TLD_TYPOS[tld]) {
    const suggested = v.slice(0, -tld.length) + TLD_TYPOS[tld]
    return { ok: false, error: `Did you mean ${suggested}?` }
  }
  return { ok: true, value: v }
}

export function normalizeToE164(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (E164.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export function validatePhone(input: string | null | undefined): { ok: true; value: string } | { ok: false; error: string } {
  const v = (input ?? '').trim()
  if (!v) return { ok: false, error: 'Phone is required' }
  const e164 = normalizeToE164(v)
  if (!e164) return { ok: false, error: 'Enter a valid phone (e.g. +1 555 123 4567)' }
  return { ok: true, value: e164 }
}
