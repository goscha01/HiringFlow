import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public preview endpoint for the dashboard "Copy link" button. Returns just
// enough to play the video on /preview/video/[id] — no workspace data, no
// transcript, no analysis fields. videoIds are UUIDs so they're effectively
// unguessable; the underlying R2 URLs are already public via the r2.dev
// domain, so this is mainly a convenience wrapper so the share page can hand
// the browser a single URL.
//
// Returns 404 for videos that aren't fully transcoded yet — share links
// shouldn't surface "Transcoding…" placeholders to whoever the recruiter
// pastes the URL to.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const video = await prisma.video.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      filename: true,
      displayName: true,
      mimeType: true,
      durationSeconds: true,
      sizeBytes: true,
      status: true,
      hlsManifestUrl: true,
      posterUrl: true,
      storageKey: true,
      createdAt: true,
    },
  })
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (video.status !== 'ready') {
    return NextResponse.json({ error: 'Video is still processing', status: video.status }, { status: 409 })
  }
  return NextResponse.json({
    id: video.id,
    filename: video.filename,
    displayName: video.displayName,
    mimeType: video.mimeType,
    durationSeconds: video.durationSeconds,
    sizeBytes: video.sizeBytes,
    hlsManifestUrl: video.hlsManifestUrl,
    posterUrl: video.posterUrl,
    // storageKey is also exposed for the fallback path (legacy Vercel Blob
    // videos with no HLS manifest — viewer plays the source MP4 directly).
    sourceUrl: video.storageKey,
    createdAt: video.createdAt,
  })
}
