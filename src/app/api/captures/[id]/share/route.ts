import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import {
  CaptureError,
  loadCaptureForWorkspace,
} from '@/lib/capture/capture-response.service'

// Recruiter-facing share token management.
//
// POST   /api/captures/[id]/share  → mint a token if missing, return existing
//                                    token + URL otherwise (idempotent).
// DELETE /api/captures/[id]/share  → revoke (clears the column).
//
// The public playback path is /api/public/captures/[token]. The token is a
// 24-byte url-safe random string with high enough entropy that brute-forcing
// is impractical; revocation gives the recruiter an out if a link leaks.

function appBaseUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    'https://www.hirefunnel.app'
  ).replace(/\/+$/, '')
}

function buildShareUrl(token: string): string {
  return `${appBaseUrl()}/share/recording/${token}`
}

function mintToken(): string {
  // 24 bytes → 32-char base64url. Plenty of entropy and short enough to fit
  // in an SMS / email body without wrapping.
  return randomBytes(24).toString('base64url')
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  try {
    const capture = await loadCaptureForWorkspace({
      captureId: params.id,
      workspaceId: ws.workspaceId,
    })
    if (!capture.storageKey) {
      return NextResponse.json(
        { error: 'Capture has no playable media yet' },
        { status: 409 },
      )
    }
    if (capture.shareToken) {
      return NextResponse.json({
        shareToken: capture.shareToken,
        shareUrl: buildShareUrl(capture.shareToken),
        shareCreatedAt: capture.shareCreatedAt?.toISOString() ?? null,
      })
    }

    // Loop on the rare unique-collision case. Two retries is plenty given
    // 24-byte entropy; the third would only happen if randomBytes is broken.
    let token = mintToken()
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const updated = await prisma.captureResponse.update({
          where: { id: capture.id },
          data: { shareToken: token, shareCreatedAt: new Date() },
        })
        return NextResponse.json({
          shareToken: updated.shareToken!,
          shareUrl: buildShareUrl(updated.shareToken!),
          shareCreatedAt: updated.shareCreatedAt?.toISOString() ?? null,
        })
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code
        if (code === 'P2002' && attempt < 2) {
          token = mintToken()
          continue
        }
        throw err
      }
    }
    return NextResponse.json({ error: 'Could not mint share token' }, { status: 500 })
  } catch (err) {
    if (err instanceof CaptureError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('[captures/share POST] unexpected error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  try {
    const capture = await loadCaptureForWorkspace({
      captureId: params.id,
      workspaceId: ws.workspaceId,
    })
    if (!capture.shareToken) {
      return NextResponse.json({ shareToken: null })
    }
    await prisma.captureResponse.update({
      where: { id: capture.id },
      data: { shareToken: null, shareCreatedAt: null },
    })
    return NextResponse.json({ shareToken: null })
  } catch (err) {
    if (err instanceof CaptureError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('[captures/share DELETE] unexpected error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
