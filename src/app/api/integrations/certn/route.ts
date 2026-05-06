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
      useSandbox: true,
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
          useSandbox: integration.useSandbox,
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
    useSandbox?: boolean
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
    useSandbox?: boolean
    apiKeyEncrypted?: string
    webhookSecret?: string | null
    defaultCheckTypes?: object
    inviteExpiryDays?: number
  } = { region }

  if (typeof body.useSandbox === 'boolean') {
    data.useSandbox = body.useSandbox
  }
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
          useSandbox: data.useSandbox ?? false,
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
      useSandbox: integration.useSandbox,
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

    // Diagnostic fallback: when CertnCentric returns 401/403, the key is
    // probably from the deprecated v1 API ("Token" auth scheme on
    // api.certn.co, also api.{ca,uk,au}.certn.co with a different path
    // shape). Probe both common legacy variants and surface which (if any)
    // worked, so the user can tell whether they have a legacy key or a
    // genuinely-broken one.
    let legacyProbe: { worked: boolean; host: string; scheme: string; status: number } | null = null
    if (res.status === 401 || res.status === 403) {
      const legacyHosts = ['https://api.certn.co', client.baseUrl] // base region URL too
      const legacySchemes = ['Token', 'Bearer']
      const legacyPaths = ['/api/v1/hr/applicants/?limit=1', '/api/v1/applicants/?limit=1']
      outer: for (const h of legacyHosts) {
        for (const s of legacySchemes) {
          for (const p of legacyPaths) {
            try {
              const probeRes = await fetch(`${h}${p}`, {
                method: 'GET',
                headers: { 'Authorization': `${s} ${client.apiKey}`, 'Accept': 'application/json' },
                cache: 'no-store',
              })
              if (probeRes.status >= 200 && probeRes.status < 300) {
                legacyProbe = { worked: true, host: h, scheme: s, status: probeRes.status }
                break outer
              }
              // Track the most-informative failure too — a 404 with auth
              // success (rare) would beat a 401.
              if (!legacyProbe || probeRes.status !== 401) {
                legacyProbe = { worked: false, host: h, scheme: s, status: probeRes.status }
              }
            } catch { /* swallow — keep trying */ }
          }
        }
      }
    }

    let hint: string
    if (res.status === 401 || res.status === 403) {
      if (legacyProbe?.worked) {
        hint = `KEY DIAGNOSIS: Your token works against the LEGACY Certn v1 API (${legacyProbe.host}, header "Authorization: ${legacyProbe.scheme} ..."), NOT CertnCentric. CertnCentric needs a different key. Options: (a) contact Certn support and ask them to provision a CertnCentric API key for your account, or (b) keep using the legacy v1 API — but it's deprecated and shuts down 2026-08-05, so (a) is strongly preferred.`
      } else if (client.useSandbox) {
        hint = 'Sandbox key rejected. Confirm the key is from a sandbox/test workspace (production keys do not work against sandbox hosts). Also try a different region.'
      } else {
        hint = 'Production key rejected. Three things to try: (1) toggle "Use sandbox environment" if your Certn account is a sandbox/test workspace, (2) try a different region (CA / UK / AU), (3) regenerate the key in your Certn portal.'
      }
    } else if (res.status === 404) {
      hint = 'Endpoint returned 404. This account may still be on the legacy v1 API rather than CertnCentric — contact Certn support.'
    } else {
      hint = `Certn returned ${res.status}.`
    }

    return NextResponse.json({
      ok: false,
      error: res.status === 401 || res.status === 403 ? 'auth_failed' : 'request_failed',
      status: res.status,
      region: client.region,
      sandbox: client.useSandbox,
      url,
      body: bodyPreview,
      legacyProbe,
      hint,
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
