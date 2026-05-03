/**
 * Outbound SMS via Sigcore Platform API (v1).
 *
 * Sigcore is the multi-tenant communication platform that owns Twilio
 * credentials, A2P 10DLC registration, and assigned sender numbers per
 * profile. HiringFlow is one Sigcore tenant with a single profile that
 * owns the assigned HF sender number (e.g. +1 918 309 1938).
 *
 * Endpoint: POST {SIGCORE_API_URL}/api/v1/messages
 *   Auth:    X-API-Key: {SIGCORE_API_KEY}        (tenant-scoped: sc_tenant_*)
 *   Body:    { toNumber, body, profileId, channel: 'sms', metadata? }
 *   Returns: { success, data: { id, providerMessageId, status, provider, ... } }
 *
 * Sigcore's outbound resolver looks up the assigned sender number for
 * `profileId` (via profile_phone_assignments → tenant_phone_numbers) and
 * routes through the right provider (Twilio/OpenPhone) automatically.
 * No fromNumber, businessId, or phoneNumberId is required from the caller.
 */

const E164 = /^\+[1-9]\d{6,14}$/

export class SmsConfigError extends Error {}
export class SmsValidationError extends Error {}
export class SmsSendError extends Error {
  constructor(message: string, public readonly status?: number, public readonly providerError?: string) {
    super(message)
  }
}

export interface SmsSendInput {
  /** HF Session.id — passed as metadata for downstream lookup. */
  candidateId: string
  /** HF workspace UUID — passed as metadata so Sigcore can attribute usage. */
  workspaceId: string
  /** Candidate's phone, ideally already E.164 (`+15551234567`). */
  to: string
  /** Plain-text SMS body, post-merge-token rendering. */
  body: string
  /** AutomationExecution.id, passed as metadata for tracing. */
  automationExecutionId?: string
}

export interface SmsSendResult {
  /** Twilio SID (preferred) or Sigcore message UUID (fallback). */
  providerMessageId: string
  status: string
}

export function normalizeToE164(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (E164.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export function isE164(value: string): boolean {
  return E164.test(value)
}

export async function sendSms(input: SmsSendInput): Promise<SmsSendResult> {
  const apiUrl = process.env.SIGCORE_API_URL
  const apiKey = process.env.SIGCORE_API_KEY
  const profileId = process.env.SIGCORE_HF_PROFILE_ID
  if (!apiUrl) throw new SmsConfigError('SIGCORE_API_URL is not configured')
  if (!apiKey) throw new SmsConfigError('SIGCORE_API_KEY is not configured')
  if (!profileId) throw new SmsConfigError('SIGCORE_HF_PROFILE_ID is not configured')

  if (!input.body || input.body.trim().length === 0) {
    throw new SmsValidationError('SMS body is empty')
  }
  const normalized = normalizeToE164(input.to)
  if (!normalized) {
    throw new SmsValidationError(`Invalid recipient phone: ${input.to}`)
  }

  const endpoint = `${apiUrl.replace(/\/+$/, '')}/api/v1/messages`
  const payload = {
    toNumber: normalized,
    body: input.body,
    profileId,
    channel: 'sms',
    metadata: {
      candidateId: input.candidateId,
      workspaceId: input.workspaceId,
      automationExecutionId: input.automationExecutionId,
      source: `hiringflow:${input.workspaceId}`,
    },
  }

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    throw new SmsSendError(`Sigcore unreachable: ${(err as Error).message}`)
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    throw new SmsSendError(
      `Sigcore returned ${res.status}: ${bodyText.slice(0, 200) || res.statusText}`,
      res.status,
      bodyText,
    )
  }

  const json = await res.json().catch(() => null) as
    | { success?: boolean; data?: { id?: string; providerMessageId?: string; status?: string } }
    | null
  const msg = json?.data
  const providerMessageId = msg?.providerMessageId || msg?.id
  if (!providerMessageId) {
    throw new SmsSendError(
      `Sigcore response missing providerMessageId/id: ${JSON.stringify(json).slice(0, 200)}`,
    )
  }
  return {
    providerMessageId,
    status: msg?.status || 'queued',
  }
}
