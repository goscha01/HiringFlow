import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVideoUrl } from '@/lib/storage'
import { validateAccessToken, getOrCreateEnrollment } from '@/lib/training-access'
import { getWorkspaceSession } from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const training = await prisma.training.findUnique({
    where: { slug: params.slug },
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          contents: { orderBy: { sortOrder: 'asc' }, include: { video: true } },
          quiz: { include: { questions: { orderBy: { sortOrder: 'asc' } } } },
        },
      },
    },
  })

  if (!training) {
    return NextResponse.json({ error: 'Training not found' }, { status: 404 })
  }

  // Preview mode: owner/admin can view unpublished or invitation-only trainings via dashboard session.
  const isPreview = request.nextUrl.searchParams.get('preview') === '1'
  let isOwnerPreview = false
  if (isPreview) {
    const ws = await getWorkspaceSession()
    if (ws && (ws.isSuperAdmin || ws.workspaceId === training.workspaceId)) {
      isOwnerPreview = true
    }
  }

  if (!training.isPublished && !isOwnerPreview) {
    return NextResponse.json({ error: 'Training not found' }, { status: 404 })
  }

  // Token-based access control for invitation_only trainings
  const token = request.nextUrl.searchParams.get('token')
  let enrollmentId: string | null = null
  let enrollmentStatus: string | null = null
  let enrollmentProgress: unknown = null
  let candidateName: string | null = null
  let candidateEmail: string | null = null

  if (training.accessMode === 'invitation_only' && !isOwnerPreview) {
    if (!token) {
      return NextResponse.json({ error: 'Access token required', code: 'TOKEN_REQUIRED' }, { status: 403 })
    }

    const accessToken = await validateAccessToken(token, training.id)
    if (!accessToken) {
      return NextResponse.json({ error: 'Access unavailable or expired', code: 'TOKEN_INVALID' }, { status: 403 })
    }

    // Get or create enrollment for this candidate
    const enrollment = await getOrCreateEnrollment({
      trainingId: training.id,
      accessTokenId: accessToken.id,
      sessionId: accessToken.candidateId,
      userName: accessToken.candidate?.candidateName || null,
      userEmail: accessToken.candidate?.candidateEmail || null,
    })

    enrollmentId = enrollment.id
    enrollmentStatus = enrollment.status
    enrollmentProgress = enrollment.progress
    candidateName = accessToken.candidate?.candidateName || null
    candidateEmail = accessToken.candidate?.candidateEmail || null
  }

  return NextResponse.json({
    id: training.id,
    title: training.title,
    description: training.description,
    coverImage: training.coverImage,
    branding: training.branding,
    passingGrade: training.passingGrade,
    accessMode: training.accessMode,
    enrollmentId,
    enrollmentStatus,
    enrollmentProgress,
    candidateName,
    candidateEmail,
    sections: training.sections.map((s) => ({
      id: s.id,
      title: s.title,
      contents: s.contents.map((c) => ({
        id: c.id,
        type: c.type,
        videoUrl: c.video ? getVideoUrl(c.video.storageKey) : null,
        videoName: c.video?.displayName || c.video?.filename || null,
        requiredWatch: c.requiredWatch,
        autoplayNext: c.autoplayNext,
        textContent: c.textContent,
      })),
      quiz: s.quiz ? {
        id: s.quiz.id,
        title: s.quiz.title,
        requiredPassing: s.quiz.requiredPassing,
        passingGrade: s.quiz.passingGrade,
        questions: s.quiz.questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          // Don't expose isCorrect — only send option text
          options: (q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>).map((o, i) => ({
            index: i,
            text: o.text,
          })),
        })),
      } : null,
    })),
  })
}

// Submit quiz answers — returns score
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const training = await prisma.training.findUnique({
    where: { slug: params.slug },
    include: {
      sections: {
        include: {
          quiz: { include: { questions: true } },
        },
      },
    },
  })

  if (!training || !training.isPublished) {
    return NextResponse.json({ error: 'Training not found' }, { status: 404 })
  }

  const { quizId, answers, enrollmentId } = await request.json()
  // answers: { questionId: number[] (selected option indices) }

  // Find the quiz
  const quiz = training.sections.flatMap(s => s.quiz ? [s.quiz] : []).find(q => q.id === quizId)
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

  let correct = 0
  const results = quiz.questions.map((q) => {
    const opts = q.options as Array<{ text: string; isCorrect: boolean; hint?: string }>
    const selected = (answers[q.id] || []) as number[]
    const isCorrect = opts.every((o, i) => o.isCorrect === selected.includes(i))
    if (isCorrect) correct++
    return {
      questionId: q.id,
      isCorrect,
      correctIndices: opts.map((o, i) => o.isCorrect ? i : -1).filter(i => i >= 0),
      hints: opts.map((o, i) => selected.includes(i) ? (o.hint || null) : null),
    }
  })

  const score = Math.round((correct / quiz.questions.length) * 100)
  const passed = score >= quiz.passingGrade

  // Update enrollment progress if enrollmentId provided
  if (enrollmentId) {
    try {
      const enrollment = await prisma.trainingEnrollment.findUnique({ where: { id: enrollmentId } })
      if (enrollment) {
        const progress = (enrollment.progress as { completedSections: string[]; quizScores: { sectionId: string; score: number }[] }) || { completedSections: [], quizScores: [] }
        // Find which section this quiz belongs to
        const section = training.sections.find(s => s.quiz?.id === quizId)
        if (section) {
          // Update quiz score
          const existingIdx = progress.quizScores.findIndex((qs: { sectionId: string }) => qs.sectionId === section.id)
          if (existingIdx >= 0) {
            progress.quizScores[existingIdx].score = score
          } else {
            progress.quizScores.push({ sectionId: section.id, score })
          }
          // Mark section as completed if passed
          if (passed && !progress.completedSections.includes(section.id)) {
            progress.completedSections.push(section.id)
          }
          await prisma.trainingEnrollment.update({
            where: { id: enrollmentId },
            data: { progress },
          })
        }
      }
    } catch (err) {
      console.error('[Training] Failed to update enrollment progress:', err)
    }
  }

  return NextResponse.json({ score, correct, total: quiz.questions.length, passed, results })
}
