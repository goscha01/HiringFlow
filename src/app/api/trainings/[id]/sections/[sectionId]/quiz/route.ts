import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest, { params }: { params: { id: string; sectionId: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const training = await prisma.training.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()

  const quiz = await prisma.trainingQuiz.upsert({
    where: { sectionId: params.sectionId },
    create: {
      sectionId: params.sectionId,
      title: body.title || 'Section Quiz',
      requiredPassing: body.requiredPassing ?? true,
      passingGrade: body.passingGrade ?? 80,
      feedbackMode: body.feedbackMode ?? 'correctness',
    },
    update: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.requiredPassing !== undefined && { requiredPassing: body.requiredPassing }),
      ...(body.passingGrade !== undefined && { passingGrade: body.passingGrade }),
      ...(body.feedbackMode !== undefined && { feedbackMode: body.feedbackMode }),
    },
    include: { questions: { orderBy: { sortOrder: 'asc' } } },
  })

  return NextResponse.json(quiz)
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string; sectionId: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const training = await prisma.training.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()

  if (body.action === 'add_question') {
    const quiz = await prisma.trainingQuiz.findUnique({ where: { sectionId: params.sectionId } })
    if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

    const maxOrder = await prisma.trainingQuestion.aggregate({ where: { quizId: quiz.id }, _max: { sortOrder: true } })
    const question = await prisma.trainingQuestion.create({
      data: {
        quizId: quiz.id,
        questionText: body.questionText || 'New Question',
        questionType: body.questionType || 'single',
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        options: body.options || [
          { text: 'Option A', isCorrect: true },
          { text: 'Option B', isCorrect: false },
        ],
      },
    })
    return NextResponse.json(question)
  }

  // Bulk-create questions in a single round trip — used by the "Paste from Doc"
  // importer so a 20-question quiz doesn't fan out into 20 API calls + refetches.
  if (body.action === 'bulk_add_questions') {
    const quiz = await prisma.trainingQuiz.findUnique({ where: { sectionId: params.sectionId } })
    if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json({ error: 'No questions provided' }, { status: 400 })
    }

    const maxOrder = await prisma.trainingQuestion.aggregate({ where: { quizId: quiz.id }, _max: { sortOrder: true } })
    const baseOrder = (maxOrder._max.sortOrder ?? -1) + 1

    const created = await prisma.$transaction(
      body.questions.map((q: { questionText: string; questionType: string; options: unknown }, i: number) =>
        prisma.trainingQuestion.create({
          data: {
            quizId: quiz.id,
            questionText: q.questionText || 'New Question',
            questionType: q.questionType || 'single',
            sortOrder: baseOrder + i,
            options: q.options ?? [],
          },
        })
      )
    )
    return NextResponse.json({ created: created.length })
  }

  if (body.action === 'update_question') {
    const updated = await prisma.trainingQuestion.update({
      where: { id: body.questionId },
      data: {
        ...(body.questionText !== undefined && { questionText: body.questionText }),
        ...(body.questionType !== undefined && { questionType: body.questionType }),
        ...(body.options !== undefined && { options: body.options }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
    })
    return NextResponse.json(updated)
  }

  if (body.action === 'delete_question') {
    await prisma.trainingQuestion.delete({ where: { id: body.questionId } })
    return NextResponse.json({ success: true })
  }

  // Metadata update (no action): title / requiredPassing / passingGrade / feedbackMode
  if (body.title !== undefined || body.requiredPassing !== undefined || body.passingGrade !== undefined || body.feedbackMode !== undefined) {
    const updated = await prisma.trainingQuiz.update({
      where: { sectionId: params.sectionId },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.requiredPassing !== undefined && { requiredPassing: body.requiredPassing }),
        ...(body.passingGrade !== undefined && { passingGrade: body.passingGrade }),
        ...(body.feedbackMode !== undefined && { feedbackMode: body.feedbackMode }),
      },
    })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; sectionId: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const training = await prisma.training.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.trainingQuiz.delete({ where: { sectionId: params.sectionId } })
  return NextResponse.json({ success: true })
}
