import { prisma } from './prisma'

// Heartbeat for the candidate-facing flows. Bumped whenever the candidate
// does anything that proves they're still engaged: answers a flow step,
// progresses a training, submits a quiz. The recruiter UI surfaces this
// as "last active 4 min ago" so a stalled candidate is visually obvious
// from one that's still in the middle of the funnel.
//
// Always non-blocking — a missed heartbeat must never break the candidate's
// progression. Callers don't await the failure path.
export async function bumpSessionActivity(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) return
  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    })
  } catch {
    // swallow — heartbeat is best-effort
  }
}
