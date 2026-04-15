import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startWatch, stopWatch } from '@/lib/google'

// Renews Google Calendar event watches before they expire.
// Vercel Cron calls this daily; we renew anything expiring within 48h.
export async function GET(request: NextRequest) {
  // Vercel Cron sends an Authorization header set from CRON_SECRET env var
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() + 48 * 60 * 60 * 1000)
  const expiring = await prisma.googleIntegration.findMany({
    where: {
      OR: [
        { watchExpiresAt: null },
        { watchExpiresAt: { lt: cutoff } },
      ],
    },
    select: { workspaceId: true },
  })

  const results: Array<{ workspaceId: string; ok: boolean; error?: string }> = []
  for (const { workspaceId } of expiring) {
    try {
      await stopWatch(workspaceId).catch(() => {}) // stop old channel
      await startWatch(workspaceId)
      results.push({ workspaceId, ok: true })
    } catch (err: any) {
      console.error(`[Cron] Failed to renew watch for ${workspaceId}:`, err?.message)
      results.push({ workspaceId, ok: false, error: err?.message })
    }
  }

  return NextResponse.json({ renewed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results })
}
