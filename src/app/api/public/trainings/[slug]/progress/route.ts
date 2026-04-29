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

  // Route through the funnel-stage trigger so workspaces can map per-training
  // started events; falls back to the legacy 'training_in_progress' marker.
  if (enrollment.sessionId) {
    await fireTrainingStartedAutomations(enrollment.sessionId, enrollment.trainingId).catch(() => {})
  }

  const updated = await prisma.trainingEnrollment.update({
    where: { id: enrollmentId },
    data: {
      status: 'in_progress',
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
