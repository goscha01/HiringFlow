import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  presignCapturePlayback,
  parseCaptureStorageKey,
} from '@/lib/capture/capture-storage.service'

// Public, unauthenticated playback for shared recordings. The token is a
// bearer credential — anyone with the URL can play the capture until the
// recruiter revokes (clears the column via DELETE /api/captures/[id]/share).
//
// We never disclose the workspace, candidate, or session id to the public
// reader. Only the bits a viewer needs to render the player: a short-lived
// signed playback URL, mime type, prompt, and duration.
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  const token = params.token
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const capture = await prisma.captureResponse.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      workspaceId: true,
      mode: true,
      prompt: true,
      status: true,
      mimeType: true,
      durationSec: true,
      storageKey: true,
    },
  })
  if (!capture || !capture.storageKey) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const PLAYABLE = new Set(['processed', 'processing', 'uploaded'])
  if (!PLAYABLE.has(capture.status)) {
    return NextResponse.json({ error: 'Not ready' }, { status: 409 })
  }

  // Belt-and-braces ownership check (same as the authenticated playback
  // route) — refuses to serve a key whose tenant scope doesn't match the
  // capture row's workspaceId.
  const parsed = parseCaptureStorageKey(capture.storageKey)
  if (!parsed || parsed.workspaceId !== capture.workspaceId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { url, expiresAt } = await presignCapturePlayback({
    key: capture.storageKey,
    mimeType: capture.mimeType ?? undefined,
  })

  return NextResponse.json(
    {
      mode: capture.mode,
      prompt: capture.prompt,
      mimeType: capture.mimeType,
      durationSec: capture.durationSec,
      playbackUrl: url,
      playbackExpiresAt: expiresAt.toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      },
    },
  )
}
