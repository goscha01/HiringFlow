/**
 * CertnCentric API client.
 *
 * Auth model: per-workspace static API key (NOT OAuth — Certn doesn't expose
 * an OAuth flow). Customers create the key in their Certn Client Portal and
 * paste it into our settings UI; we store it AES-256-GCM-encrypted via
 * lib/crypto.ts. Region is mandatory — Certn is data-domiciled and the same
 * key is invalid in another region.
 *
 *   Authorization: Api-Key <key>
 *
 * Rate limit: 60 req/min, 7220 req/day per account. We rely on webhooks for
 * status updates so the reconciliation cron stays well under that bound.
 *
 * Reference: https://centric-api-docs.certn.co/
 */

import { prisma } from '../prisma'
import { decrypt } from '../crypto'

export type CertnRegion = 'CA' | 'UK' | 'AU'

export class CertnError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'CertnError'
    this.status = status
    this.body = body
  }
}

export class CertnConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CertnConfigError'
  }
}

export function baseUrlForRegion(region: CertnRegion | string): string {
  const r = (region || 'CA').toUpperCase()
  switch (r) {
    case 'UK': return 'https://api.uk.certn.co'
    case 'AU': return 'https://api.au.certn.co'
    case 'CA':
    default: return 'https://api.ca.certn.co'
  }
}

interface ResolvedClient {
  apiKey: string
  region: CertnRegion
  baseUrl: string
  integrationId: string
  webhookSecret: string | null
  defaultCheckTypes: Record<string, Record<string, unknown>>
  inviteExpiryDays: number
}

/**
 * Look up the workspace's CertnIntegration row, decrypt its API key + webhook
 * secret, and return everything the client needs for an outbound call.
 * Throws CertnConfigError if the integration is missing or inactive.
 */
export async function resolveClient(workspaceId: string): Promise<ResolvedClient> {
  const integration = await prisma.certnIntegration.findUnique({
    where: { workspaceId },
  })
  if (!integration) throw new CertnConfigError('Certn integration not configured for this workspace')
  if (!integration.isActive) throw new CertnConfigError('Certn integration is disabled for this workspace')

  let apiKey: string
  try {
    apiKey = decrypt(integration.apiKeyEncrypted)
  } catch {
    throw new CertnConfigError('Failed to decrypt Certn API key — re-enter it in settings')
  }

  let webhookSecret: string | null = null
  if (integration.webhookSecret) {
    try { webhookSecret = decrypt(integration.webhookSecret) } catch { /* leave null — admin will be re-prompted */ }
  }

  const region = (integration.region as CertnRegion) || 'CA'
  const defaultCheckTypes = (integration.defaultCheckTypes as Record<string, Record<string, unknown>>) || {}

  return {
    apiKey,
    region,
    baseUrl: baseUrlForRegion(region),
    integrationId: integration.id,
    webhookSecret,
    defaultCheckTypes,
    inviteExpiryDays: integration.inviteExpiryDays,
  }
}

async function request<T>(
  client: ResolvedClient,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method || 'GET'
  const url = `${client.baseUrl}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Api-Key ${client.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })

  // 204 No Content (cancel returns this)
  if (res.status === 204) return undefined as unknown as T

  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try { parsed = JSON.parse(text) } catch { /* keep raw text */ }
  }

  if (!res.ok) {
    const detail = (parsed as { errors?: Array<{ detail?: string }> } | null)?.errors?.[0]?.detail
    throw new CertnError(
      res.status,
      `Certn ${method} ${path} failed: ${res.status} ${detail || res.statusText || text.slice(0, 200)}`,
      parsed,
    )
  }
  return parsed as T
}

// ─── Order a Case ───────────────────────────────────────────────────────────
//
// We always use the "invite via link" mode (return_invite_link=true,
// send_invite_email=false) so the link comes back in the response and our
// own AutomationStep email/SMS infrastructure delivers it. That keeps
// branding under the customer's senderEmail/senderName.

export interface OrderCaseInput {
  emailAddress: string
  checkTypesWithArguments: Record<string, Record<string, unknown>>
  // Optional applicant claims for quickscreen-style upfront data. Most
  // customers will let the applicant fill these in via the invite link.
  inputClaims?: Record<string, unknown>
  // Days from now until the invite expires. APPLICANT_EXPIRED fires after.
  expiryDays?: number
}

export interface OrderCaseResponse {
  id: string
  short_id?: string
  invite_link?: string | null
  overall_status?: string
  email_address?: string
  created?: string
}

export async function orderCase(client: ResolvedClient, input: OrderCaseInput): Promise<OrderCaseResponse> {
  const body: Record<string, unknown> = {
    email_address: input.emailAddress,
    send_invite_email: false,
    return_invite_link: true,
    check_types_with_arguments: input.checkTypesWithArguments,
  }
  if (input.inputClaims) body.input_claims = input.inputClaims
  // Certn accepts an applicant_expiry parameter in some payload variants —
  // omit if not provided to avoid 400s on accounts that don't accept it.
  if (input.expiryDays && input.expiryDays > 0) {
    body.applicant_expiry_days = input.expiryDays
  }
  return request<OrderCaseResponse>(client, '/api/public/cases/order/', { method: 'POST', body })
}

// ─── Retrieve a Case ────────────────────────────────────────────────────────

export interface CaseDetail {
  id: string
  short_id?: string
  overall_status?: string
  // CLEAR | REJECT | REVIEW | NOT_APPLICABLE | RESTRICTED | null
  overall_score?: string | null
  email_address?: string
  created?: string
  invite_link?: string | null
  // The full case object has many more fields — we only depend on the two
  // above for our state machine. Allow the rest through.
  [k: string]: unknown
}

export async function getCase(client: ResolvedClient, caseId: string): Promise<CaseDetail> {
  return request<CaseDetail>(client, `/api/public/cases/${caseId}/`)
}

// ─── Cancel a Case ──────────────────────────────────────────────────────────

export async function cancelCase(client: ResolvedClient, caseId: string): Promise<void> {
  await request<void>(client, `/api/public/cases/${caseId}/cancel/`, { method: 'POST' })
}

// ─── Report Generation (lazy, on-demand only) ───────────────────────────────
//
// Certn does NOT auto-generate the PDF when checks complete — you have to ask.
// We don't store reports; the candidate-page "Download report" button calls
// generateReport, then waits for the CASE_REPORT_READY webhook (or polls), then
// fetches the presigned URL via getReportFile.

export interface GenerateReportResponse {
  id: string  // report-file id used by getReportFile
  [k: string]: unknown
}

export async function generateReport(client: ResolvedClient, caseId: string): Promise<GenerateReportResponse> {
  return request<GenerateReportResponse>(client, `/api/public/cases/${caseId}/generate-report/`, {
    method: 'POST',
    body: {},
  })
}

export interface ReportFileResponse {
  // Presigned download URL — short-lived, do not persist.
  url?: string
  status?: string
  [k: string]: unknown
}

export async function getReportFile(client: ResolvedClient, reportFileId: string): Promise<ReportFileResponse> {
  return request<ReportFileResponse>(client, `/api/public/cases/report-files/${reportFileId}/`)
}

// ─── Score → trigger mapping ────────────────────────────────────────────────
//
// Five values from Certn: CLEAR | REJECT | REVIEW | NOT_APPLICABLE | RESTRICTED.
// We collapse them into three triggers that the automation engine dispatches.

export type BackgroundCheckOutcome = 'passed' | 'failed' | 'needs_review'

export function outcomeFromScore(score: string | null | undefined): BackgroundCheckOutcome | null {
  if (!score) return null
  switch (score.toUpperCase()) {
    case 'CLEAR':
    case 'NOT_APPLICABLE':
      return 'passed'
    case 'REJECT':
      return 'failed'
    case 'REVIEW':
    case 'RESTRICTED':
      return 'needs_review'
    default:
      return null
  }
}

// Terminal Certn case statuses — once the case lands here, no further state
// changes are expected and the reconciliation cron can stop polling.
export const TERMINAL_CASE_STATUSES = new Set([
  'COMPLETE',
  'CANCELLED',
  'APPLICANT_EXPIRED',
  'APPLICANT_DECLINED',
  'INVITE_UNDELIVERABLE',
])

export function isTerminalStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_CASE_STATUSES.has(status.toUpperCase())
}
