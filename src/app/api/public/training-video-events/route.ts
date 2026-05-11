import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

// Public, unauthenticated endpoint that accepts client-side playback telemetry
// from the training video player and forwards it to LogHub. The client uses
// navigator.sendBeacon when available, so this route MUST always succeed quickly
// (never throws, never blocks on heavy work) — sendBeacon discards the request
// on shutdown if the server takes too long. We log and return 204.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    const cap = (v: unknown, n: number) => String(v ?? '').slice(0, n)
    const num = (v: unknown) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }

    logger.info('training_video_event', {
      event: cap(body.event, 32),
      slug: cap(body.slug, 80),
      contentId: cap(body.contentId, 80),
      videoHost: cap(body.videoHost, 80),
      videoKey: cap(body.videoKey, 200),
      ua: cap(body.ua, 200),
      effectiveType: cap(body.effectiveType, 16),
      msFromPageLoad: num(body.msFromPageLoad),
      stallCount: num(body.stallCount),
      currentTime: num(body.currentTime),
      duration: num(body.duration),
      readyState: num(body.readyState),
      networkState: num(body.networkState),
      errorCode: num(body.errorCode),
    })
  } catch {
    // Never error the client. Telemetry is best-effort.
  }
  return new NextResponse(null, { status: 204 })
}
