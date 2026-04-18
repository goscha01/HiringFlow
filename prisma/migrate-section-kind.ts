/**
 * One-off data migration for TrainingSection.kind.
 *
 * Rule:
 *  - Section has quiz AND >=1 content → split into two sections:
 *      [kind='video' with contents] + [kind='quiz' with the quiz]
 *  - Section has quiz only → kind='quiz'
 *  - Otherwise → kind='video' (default, already applied by schema)
 *
 * Safe to re-run — idempotent because split sections already carry distinct kinds.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const sections = await prisma.trainingSection.findMany({
    include: { contents: true, quiz: true },
    orderBy: [{ trainingId: 'asc' }, { sortOrder: 'asc' }],
  })

  let splits = 0
  let quizOnly = 0
  let videoOnly = 0

  for (const s of sections) {
    const hasContents = s.contents.length > 0
    const hasQuiz = !!s.quiz

    if (hasContents && hasQuiz) {
      // Split: current section stays as video (keeps contents); new section takes the quiz.
      // Shift siblings down to make room for the new quiz section at sortOrder + 1.
      await prisma.trainingSection.updateMany({
        where: { trainingId: s.trainingId, sortOrder: { gt: s.sortOrder } },
        data: { sortOrder: { increment: 1 } },
      })
      const quizSection = await prisma.trainingSection.create({
        data: {
          trainingId: s.trainingId,
          title: s.quiz!.title || `${s.title} — Quiz`,
          kind: 'quiz',
          sortOrder: s.sortOrder + 1,
        },
      })
      // Re-parent the quiz to the new section. The sectionId is @unique, so we update by id.
      await prisma.trainingQuiz.update({
        where: { id: s.quiz!.id },
        data: { sectionId: quizSection.id },
      })
      await prisma.trainingSection.update({ where: { id: s.id }, data: { kind: 'video' } })
      splits++
    } else if (hasQuiz && !hasContents) {
      await prisma.trainingSection.update({ where: { id: s.id }, data: { kind: 'quiz' } })
      quizOnly++
    } else {
      // Default 'video' already applied at schema level; update explicitly for clarity.
      await prisma.trainingSection.update({ where: { id: s.id }, data: { kind: 'video' } })
      videoOnly++
    }
  }

  console.log(`[migrate-section-kind] split=${splits} quizOnly=${quizOnly} videoOnly=${videoOnly}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
