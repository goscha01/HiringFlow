/**
 * Extension token lifecycle endpoints.
 *
 * The HireFunnel Meet Tracker Chrome extension authenticates its
 * attendance POSTs with a workspace-scoped bearer token issued here.
 * The token is created by the dashboard's "Connect" button, sent to
 * the extension via chrome.runtime.sendMessage(EXTENSION_ID, { type:
 * 'CONNECT', token, ... }), and never displayed or persisted anywhere
 * outside that one round-trip. Only the SHA-256 hash is stored in the
 * DB — if the user clears the extension (or wants to revoke), they
 * just rotate by hitting POST again or DELETE.
 *
 * Routes:
 *   POST   — issue a new token. Revokes any prior active tokens for
 *            this workspace (one-active-token policy keeps the UX
 *            simple; multi-token is a future enhancement).
 *   GET    — connection status: whether an unrevoked token exists,
 *            its prefix and lastUsedAt for the UI. Token value is
 *            never returned.
 *   DELETE — revoke all active tokens for this workspace.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const TOKEN_PREFIX = 'hfme_'

function generateToken(): { plaintext: string; hash: string; prefix: string } {
  const random = randomBytes(32).toString('hex')
  const plaintext = `${TOKEN_PREFIX}${random}`
  const hash = createHash('sha256').update(plaintext).digest('hex')
  // Show enough of the prefix to be recognizable in revoke UI without
  // leaking entropy: "hfme_a1b2c3d4..." (12 chars total).
  const prefix = plaintext.slice(0, 12)
  return { plaintext, hash, prefix }
}

function publicAppUrl(): string {
  // Strip the X-Forwarded-* uncertainty: pin the API base URL the extension
  // should call to the canonical public host. Falls back to localhost in dev.
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://hirefunnel.app').replace(/\/+$/, '')
}

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const active = await prisma.extensionToken.findFirst({
    where: { workspaceId: ws.workspaceId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, prefix: true, label: true, createdAt: true, lastUsedAt: true },
  })

  return NextResponse.json({
    connected: !!active,
    apiBaseUrl: publicAppUrl(),
    workspaceId: ws.workspaceId,
    token: active
      ? { id: active.id, prefix: active.prefix, label: active.label, createdAt: active.createdAt, lastUsedAt: active.lastUsedAt }
      : null,
  })
}

export async function POST(req: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const body = await req.json().catch(() => ({})) as { label?: string }
  const label = (body.label || req.headers.get('user-agent') || 'Chrome extension').slice(0, 120)

  const { plaintext, hash, prefix } = generateToken()

  // Revoke prior active tokens then create the new one in a single
  // transaction so a partial failure doesn't leave the workspace with
  // either two active tokens or zero.
  const created = await prisma.$transaction(async (tx) => {
    await tx.extensionToken.updateMany({
      where: { workspaceId: ws.workspaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return tx.extensionToken.create({
      data: {
        workspaceId: ws.workspaceId,
        tokenHash: hash,
        prefix,
        label,
        createdById: ws.userId,
      },
      select: { id: true, prefix: true, label: true, createdAt: true },
    })
  })

  return NextResponse.json({
    ok: true,
    apiBaseUrl: publicAppUrl(),
    workspaceId: ws.workspaceId,
    // Plaintext token — returned EXACTLY ONCE so the dashboard can hand it
    // to the extension via chrome.runtime.sendMessage. Never logged.
    token: plaintext,
    metadata: created,
  })
}

export async function DELETE() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const result = await prisma.extensionToken.updateMany({
    where: { workspaceId: ws.workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ ok: true, revokedCount: result.count })
}
