import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVideoUrl } from '@/lib/storage'

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

  if (!training || !training.isPublished) {
    return NextResponse.json({ error: 'Training not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: training.id,
    title: training.title,
    description: training.description,
    coverImage: training.coverImage,
    branding: training.branding,
    passingGrade: training.passingGrade,
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

  const { quizId, answers } = await request.json()
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

  return NextResponse.json({ score, correct, total: quiz.questions.length, passed, results })
}
