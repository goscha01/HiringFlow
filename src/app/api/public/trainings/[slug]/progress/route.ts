import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { completeEnrollment } from '@/lib/training-access'
import { fireTrainingCompletedAutomations, fireTrainingStartedAutomations } from '@/lib/automation'

/**
 * PATCH — Update training progress (section completion, status changes)
 * POST  — Mark training as completed
 */
export async function PATCH(request: NextRequest) {
  const { enrollmentId, completedSections } = await request.json()

  if (!enrollmentId) {
    return NextResponse.json({ error: 'enrollmentId required' }, { status: 400 })
  }

  const enrollment = await prisma.trainingEnrollment.findUnique({ where: { id: enrollmentId } })
  if (!enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
  }

  const progress = (enrollment.progress as { completedSections: string[]; quizScores: { sectionId: string; score: number }[] }) || { completedSections: [], quizScores: [] }

  if (completedSections) {
    progress.completedSections = completedSections
  }

  // Once an enrollment is completed, navigating back to a section or
  // re-PATCHing progress shouldn't downgrade status from 'completed' to
  // 'in_progress' — that masked the real state and caused the funnel
  // backfill to misclassify already-graduated candidates.
  const isCompleted = enrollment.status === 'completed' || enrollment.completedAt !== null

  // Route through the funnel-stage trigger only on initial progression so
  // we don't re-fire training_started for every section navigation post-
  // completion.
  if (enrollment.sessionId && !isCompleted) {
    await fireTrainingStartedAutomations(enrollment.sessionId, enrollment.trainingId).catch(() => {})
  }

  const updated = await prisma.trainingEnrollment.update({
    where: { id: enrollmentId },
    data: {
      status: isCompleted ? 'completed' : 'in_progress',
      progress,
    },
  })

  return NextResponse.json({ success: true, progress: updated.progress, status: updated.status })
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

  return NextResponse.json({ success: true, status: 'completed' })
}
