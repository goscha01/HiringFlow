/**
 * Clean up artifacts mis-attributed during the buggy backfill run that
 * unioned session-wide SchedulingEvents instead of meeting-scoped ones. An
 * artifact is considered mis-attributed if its driveCreatedTime falls
 * OUTSIDE every (scheduledStart-1h, scheduledEnd+4h) window the meeting
 * ever had per its own SchedulingEvents (or current scheduledStart/End).
 *
 * Idempotent: keeps any artifact that fits at least one window. Safe to
 * re-run.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const meetings = await prisma.interviewMeeting.findMany({
    select: { id: true, sessionId: true, scheduledStart: true, scheduledEnd: true },
  })

  let removed = 0, kept = 0
  for (const m of meetings) {
    const events = await prisma.schedulingEvent.findMany({
      where: {
        sessionId: m.sessionId,
        eventType: { in: ['meeting_scheduled', 'meeting_rescheduled'] },
        metadata: { path: ['interviewMeetingId'], equals: m.id },
      },
      select: { metadata: true },
    })

    const windows: Array<{ start: number; end: number }> = [{
      start: m.scheduledStart.getTime() - 60 * 60 * 1000,
      end: m.scheduledEnd.getTime() + 4 * 60 * 60 * 1000,
    }]
    for (const ev of events) {
      const meta = (ev.metadata as Record<string, unknown> | null) || {}
      const sAt = typeof meta.scheduledAt === 'string' ? new Date(meta.scheduledAt) : null
      const eAt = typeof meta.endAt === 'string' ? new Date(meta.endAt) : null
      if (sAt && !isNaN(sAt.getTime()) && eAt && !isNaN(eAt.getTime())) {
        windows.push({ start: sAt.getTime() - 60 * 60 * 1000, end: eAt.getTime() + 4 * 60 * 60 * 1000 })
      } else if (sAt && !isNaN(sAt.getTime())) {
        // Some events only carry scheduledAt; assume a 30-min duration.
        windows.push({
          start: sAt.getTime() - 60 * 60 * 1000,
          end: sAt.getTime() + 30 * 60 * 1000 + 4 * 60 * 60 * 1000,
        })
      }
    }

    const artifacts = await prisma.interviewMeetingArtifact.findMany({
      where: { interviewMeetingId: m.id },
      select: { id: true, driveCreatedTime: true, fileName: true },
    })
    for (const a of artifacts) {
      const t = a.driveCreatedTime.getTime()
      const fits = windows.some((w) => t >= w.start && t <= w.end)
      if (fits) { kept++; continue }
      console.log(`  DELETE  meeting=${m.id}  artifact=${a.id}  created=${a.driveCreatedTime.toISOString()}  name=${a.fileName?.slice(0, 60) ?? '-'}`)
      await prisma.interviewMeetingArtifact.delete({ where: { id: a.id } })
      removed++
    }
  }

  console.log(`\nRemoved ${removed} mis-attributed artifact(s); kept ${kept}.`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
