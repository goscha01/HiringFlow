/**
 * GET    /api/integrations/certn — return current integration status (no secrets).
 * PUT    /api/integrations/certn — upsert API key + region + webhook secret + defaults.
 * DELETE /api/integrations/certn — disconnect (delete the integration row).
 *
 * The webhook URL itself is derived server-side from APP_URL + the workspace id;
 * the recruiter pastes it into the Certn portal Integrations area.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { resolveClient, getCase, CertnError, CertnConfigError } from '@/lib/certn/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function appBaseUrl(): string {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://www.hirefunnel.app'
}

function webhookUrlFor(workspaceId: string): string {
  return `${appBaseUrl().replace(/\/$/, '')}/api/webhooks/certn/${workspaceId}`
}

export async function GET() {
  const session = await getWorkspaceSession()
  if (!session) return unauthorized()

  const integration = await prisma.certnIntegration.findUnique({
    where: { workspaceId: session.workspaceId },
    select: {
      id: true,
      region: true,
      isActive: true,
      defaultCheckTypes: true,
      inviteExpiryDays: true,
      // Don't return ciphertexts — front-end has no use for them.
      webhookSecret: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    configured: !!integration,
    integration: integration
      ? {
          id: integration.id,
          region: integration.region,
          isActive: integration.isActive,
          defaultCheckTypes: integration.defaultCheckTypes ?? {},
          inviteExpiryDays: integration.inviteExpiryDays,
          hasWebhookSecret: !!integration.webhookSecret,
          createdAt: integration.createdAt,
          updatedAt: integration.updatedAt,
        }
      : null,
    webhookUrl: webhookUrlFor(session.workspaceId),
  })
}

export async function PUT(request: NextRequest) {
  const session = await getWorkspaceSession()
  if (!session) return unauthorized()

  const body = await request.json().catch(() => null) as {
    apiKey?: string | null
    region?: string
    webhookSecret?: string | null
    defaultCheckTypes?: Record<string, Record<string, unknown>>
    inviteExpiryDays?: number
  } | null
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const region = (body.region || 'CA').toUpperCase()
  if (!['CA', 'UK', 'AU'].includes(region)) {
    return NextResponse.json({ error: 'invalid_region' }, { status: 400 })
  }

  const existing = await prisma.certnIntegration.findUnique({
    where: { workspaceId: session.workspaceId },
  })

  // For updates, allow passing apiKey: null to keep existing, or new value to rotate.
  // For first-time setup, apiKey is required.
  if (!existing && (!body.apiKey || body.apiKey.trim().length === 0)) {
    return NextResponse.json({ error: 'api_key_required' }, { status: 400 })
  }

  const data: {
    region: string
    apiKeyEncrypted?: string
    webhookSecret?: string | null
    defaultCheckTypes?: object
    inviteExpiryDays?: number
  } = { region }

  if (body.apiKey && body.apiKey.trim().length > 0) {
    data.apiKeyEncrypted = encrypt(body.apiKey.trim())
  }
  if (body.webhookSecret !== undefined) {
    data.webhookSecret = body.webhookSecret && body.webhookSecret.trim().length > 0
      ? encrypt(body.webhookSecret.trim())
      : null
  }
  if (body.defaultCheckTypes !== undefined) {
    data.defaultCheckTypes = body.defaultCheckTypes
  }
  if (body.inviteExpiryDays !== undefined) {
    const n = Number(body.inviteExpiryDays)
    if (!Number.isFinite(n) || n < 1 || n > 90) {
      return NextResponse.json({ error: 'invalid_invite_expiry_days' }, { status: 400 })
    }
    data.inviteExpiryDays = Math.floor(n)
  }

  const integration = existing
    ? await prisma.certnIntegration.update({
        where: { workspaceId: session.workspaceId },
        data,
      })
    : await prisma.certnIntegration.create({
        data: {
          workspaceId: session.workspaceId,
          // Required-on-create fields
          region: data.region,
          apiKeyEncrypted: data.apiKeyEncrypted!, // guaranteed by check above
          webhookSecret: data.webhookSecret ?? null,
          defaultCheckTypes: (data.defaultCheckTypes as object) ?? null,
          ...(data.inviteExpiryDays !== undefined ? { inviteExpiryDays: data.inviteExpiryDays } : {}),
        },
      })

  return NextResponse.json({
    ok: true,
    integration: {
      id: integration.id,
      region: integration.region,
      isActive: integration.isActive,
      hasWebhookSecret: !!integration.webhookSecret,
      defaultCheckTypes: integration.defaultCheckTypes ?? {},
      inviteExpiryDays: integration.inviteExpiryDays,
    },
    webhookUrl: webhookUrlFor(session.workspaceId),
  })
}

export async function DELETE() {
  const session = await getWorkspaceSession()
  if (!session) return unauthorized()
  await prisma.certnIntegration.deleteMany({ where: { workspaceId: session.workspaceId } })
  return NextResponse.json({ ok: true })
}

// ─── POST /api/integrations/certn (subroute via ?action=test) ──────────────
//
// We piggyback POST onto a `test` action that does a cheap GET against the
// Certn API to confirm the API key + region resolve to a working account.
// Rather than a separate route file, exposing it on the same path keeps the
// integration surface compact.

export async function POST(request: NextRequest) {
  const session = await getWorkspaceSession()
  if (!session) return unauthorized()

  const action = request.nextUrl.searchParams.get('action')
  if (action !== 'test') {
    return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
  }

  try {
    const client = await resolveClient(session.workspaceId)
    // Hit /api/public/cases/ (list) — documented endpoint that returns 200
    // with an empty results array when the account has no cases. Cleaner
    // success signal than probing a known-missing case id, and lets us
    // distinguish "auth failed" (401/403) from "endpoint not on this
    // account" (404 on the list path itself = legacy v1 account).
    const url = `${client.baseUrl}/api/public/cases/?page_size=1`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Api-Key ${client.apiKey}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    })
    const bodyText = await res.text()
    const bodyPreview = bodyText.length > 500 ? bodyText.slice(0, 500) + '…' : bodyText

    if (res.ok) {
      return NextResponse.json({
        ok: true,
        region: client.region,
        baseUrl: client.baseUrl,
        status: res.status,
      })
    }

    return NextResponse.json({
      ok: false,
      error: res.status === 401 || res.status === 403 ? 'auth_failed' : 'request_failed',
      status: res.status,
      region: client.region,
      url,
      body: bodyPreview,
      hint:
        res.status === 401 || res.status === 403
          ? 'Most often: the API key is for a different region (try CA / UK / AU), or the token was revoked. The Token from Teams → API Keys (legacy portal) may not be a CertnCentric key — your account may need to generate one in the new portal.'
          : res.status === 404
            ? 'Endpoint returned 404. This account may still be on the legacy v1 API rather than CertnCentric — contact Certn support.'
            : `Certn returned ${res.status}.`,
    }, { status: 200 })
  } catch (err) {
    if (err instanceof CertnConfigError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 200 })
    }
    if (err instanceof CertnError) {
      return NextResponse.json({ ok: false, error: err.message, status: err.status, body: err.body }, { status: 200 })
    }
    console.error('[Certn test] unexpected error', err)
    return NextResponse.json({ ok: false, error: 'unexpected_error', message: (err as Error).message }, { status: 500 })
  }
}
