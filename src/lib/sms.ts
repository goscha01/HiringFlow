/**
 * Outbound SMS via Sigcore.
 *
 * Sigcore is the multi-tenant communication platform that owns Twilio
 * credentials, A2P 10DLC registration, and pooled sender numbers for our
 * suite of products (ServiceFlow, LeadBridge, Callio — and now HiringFlow).
 *
 * v1 architecture:
 *   - HiringFlow is a single Sigcore tenant (one workspace API key).
 *   - All HF candidates' messages go through one shared pool number.
 *   - Per-HF-workspace context is encoded in the `source` field so Sigcore
 *     can log/route per workspace internally.
 *   - Outbound only — candidate replies + two-way inbox are out of scope.
 *
 * Endpoint: POST {SIGCORE_API_URL}/api/internal/messages/send
 *   Auth:    X-API-Key: {SIGCORE_API_KEY}   (workspace-scoped)
 *   Body:    { businessId, toPhone, body, automationId?, leadId?, source? }
 *   Returns: { messageId, status, providerSid }
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
  /** HF Session.id — passed to Sigcore as `leadId` for downstream lookup. */
  candidateId: string
  /** HF workspace UUID — encoded into `source` so Sigcore can attribute usage. */
  workspaceId: string
  /** Candidate's phone, ideally already E.164 (`+15551234567`). */
  to: string
  /** Plain-text SMS body, post-merge-token rendering. */
  body: string
  /** AutomationExecution.id, for tracing. */
  automationExecutionId?: string
}

export interface SmsSendResult {
  providerMessageId: string
  status: string
}

/**
 * Best-effort E.164 normalization. If the input already looks E.164, returns
 * as-is. Otherwise strips formatting and prepends +1 for 10/11-digit US-style
 * numbers. Returns null if we can't confidently produce an E.164.
 *
 * For non-US workspaces this will be wrong — callers should ideally normalize
 * upstream (e.g. when capturing the form field) and only use this as a
 * defensive fallback.
 */
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

/**
 * Send an SMS via Sigcore. Throws SmsConfigError if env not configured,
 * SmsValidationError for bad input, SmsSendError for upstream failures.
 *
 * The caller is expected to wrap this in try/catch and translate failures
 * into AutomationExecution status='failed' with the error message.
 */
export async function sendSms(input: SmsSendInput): Promise<SmsSendResult> {
  const apiUrl = process.env.SIGCORE_API_URL
  const apiKey = process.env.SIGCORE_API_KEY
  const businessId = process.env.SIGCORE_HF_BUSINESS_ID
  if (!apiUrl) throw new SmsConfigError('SIGCORE_API_URL is not configured')
  if (!apiKey) throw new SmsConfigError('SIGCORE_API_KEY is not configured')
  if (!businessId) throw new SmsConfigError('SIGCORE_HF_BUSINESS_ID is not configured')

  if (!input.body || input.body.trim().length === 0) {
    throw new SmsValidationError('SMS body is empty')
  }
  const normalized = normalizeToE164(input.to)
  if (!normalized) {
    throw new SmsValidationError(`Invalid recipient phone: ${input.to}`)
  }

  const endpoint = `${apiUrl.replace(/\/+$/, '')}/api/internal/messages/send`
  const payload = {
    businessId,
    toPhone: normalized,
    body: input.body,
    leadId: input.candidateId,
    automationId: input.automationExecutionId,
    source: `hiringflow:${input.workspaceId}`,
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

  const data = await res.json().catch(() => null) as { messageId?: string; status?: string; providerSid?: string } | null
  const providerMessageId = data?.providerSid || data?.messageId
  if (!providerMessageId) {
    throw new SmsSendError(`Sigcore response missing providerSid/messageId: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return {
    providerMessageId,
    status: data?.status || 'queued',
  }
}
