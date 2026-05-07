import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { completeEnrollment } from '@/lib/training-access'
import { fireTrainingCompletedAutomations, fireTrainingStartedAutomations } from '@/lib/automation'
import { bumpSessionActivity } from '@/lib/session-activity'

// Progress JSON shape stored on TrainingEnrollment.progress.
//   `sectionTimestamps`: sectionId → ISO completion time, so the recruiter
//      timeline can render real per-section events instead of inheriting
//      the enrollment.startedAt.
//   `currentLesson`: where the candidate is right now (mid-section). Pinged
//      by the training viewer on every lesson navigation; lets the recruiter
//      see "Section 2: Safety · Lesson 3" before the section is finished.
//      Without this, a candidate who watches videos but never finishes a
//      section looks like they haven't started.
// All optional — older enrollments lack these fields and readers must
// tolerate their absence.
type EnrollmentProgress = {
  completedSections: string[]
  quizScores: { sectionId: string; score: number }[]
  sectionTimestamps?: Record<string, string>
  currentLesson?: { sectionId: string; lessonIdx: number; at: string }
}

/**
 * PATCH — Update training progress (section completion, status changes)
 * POST  — Mark training as completed
 */
export async function PATCH(request: NextRequest) {
  const { enrollmentId, completedSections, currentLesson } = await request.json()

  if (!enrollmentId) {
    return NextResponse.json({ error: 'enrollmentId required' }, { status: 400 })
  }

  // Read-modify-write the progress JSON inside a transaction with a
  // Postgres advisory lock keyed by the enrollment id. Without this, two
  // PATCHes for the same enrollment racing each other can both read a
  // stale `progress` and the second write clobbers the first — which is
  // how Daphney Laloy's two section timestamps ended up identical to the
  // millisecond. The advisory lock serializes concurrent PATCHes per
  // enrollment without blocking PATCHes against other rows.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${enrollmentId}::text, 0))`

    const enrollment = await tx.trainingEnrollment.findUnique({ where: { id: enrollmentId } })
    if (!enrollment) return { notFound: true as const }

    const progress: EnrollmentProgress = (enrollment.progress as EnrollmentProgress) || { completedSections: [], quizScores: [] }

    if (completedSections) {
      // Stamp a timestamp the first time each section appears as complete so
      // the timeline can render real per-section events. Existing entries are
      // preserved.
      const previous = new Set(progress.completedSections)
      const stamps = { ...(progress.sectionTimestamps || {}) }
      const now = new Date().toISOString()
      for (const sid of completedSections) {
        if (!previous.has(sid) && !stamps[sid]) stamps[sid] = now
      }
      progress.completedSections = completedSections
      progress.sectionTimestamps = stamps
    }

    // Lightweight position ping: validate shape and stamp received-at so
    // the recruiter card can show "Lesson 3 of section X" with a freshness
    // signal. Lesson-navigation pings double as activity heartbeats — the
    // bumpSessionActivity below catches them whether or not they include
    // a `completedSections` change.
    if (currentLesson && typeof currentLesson === 'object'
        && typeof currentLesson.sectionId === 'string'
        && Number.isInteger(currentLesson.lessonIdx) && currentLesson.lessonIdx >= 0) {
      progress.currentLesson = {
        sectionId: currentLesson.sectionId,
        lessonIdx: currentLesson.lessonIdx,
        at: new Date().toISOString(),
      }
    }

    // Once an enrollment is completed, navigating back to a section or
    // re-PATCHing progress shouldn't downgrade status from 'completed' to
    // 'in_progress' — that masked the real state and caused the funnel
    // backfill to misclassify already-graduated candidates.
    const isCompleted = enrollment.status === 'completed' || enrollment.completedAt !== null

    const updated = await tx.trainingEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: isCompleted ? 'completed' : 'in_progress',
        progress,
      },
    })

    return {
      notFound: false as const,
      sessionId: enrollment.sessionId,
      trainingId: enrollment.trainingId,
      isCompleted,
      progress: updated.progress,
      status: updated.status,
    }
  })

  if (result.notFound) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
  }

  // Route through the funnel-stage trigger only on initial progression so
  // we don't re-fire training_started for every section navigation post-
  // completion. Outside the transaction since it touches other rows.
  if (result.sessionId && !result.isCompleted) {
    await fireTrainingStartedAutomations(result.sessionId, result.trainingId).catch(() => {})
  }

  await bumpSessionActivity(result.sessionId)

  return NextResponse.json({ success: true, progress: result.progress, status: result.status })
}

export async function POST(request: NextRequest) {
  const { enrollmentId } = await request.json()

  if (!enrollmentId) {
    return NextResponse.json({ error: 'enrollmentId required' }, { status: 400 })
  }

  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { training: true },
  })
  if (!enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
  }

  if (enrollment.status === 'completed') {
    return NextResponse.json({ success: true, alreadyCompleted: true })
  }

  await completeEnrollment(enrollmentId)

  console.log(`[Training] Enrollment ${enrollmentId} completed for training ${enrollment.training.title}`)

  // Fire training_completed automations (e.g., send scheduling email)
  if (enrollment.sessionId) {
    await fireTrainingCompletedAutomations(enrollment.sessionId, enrollment.trainingId)
  }

  await bumpSessionActivity(enrollment.sessionId)

  return NextResponse.json({ success: true, status: 'completed' })
}
