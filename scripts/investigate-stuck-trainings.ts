/**
 * Find candidates stuck on "training started" with zero completed sections.
 *
 * Pre-bug-fix, the training landing page had an inline video player. Some
 * candidates clicked play, watched it, and assumed the training was done —
 * but the inline player never advanced the flow, so the enrollment stayed
 * in_progress with no completed sections, training_completed never fired,
 * and they never got the scheduling link.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/investigate-stuck-trainings.ts dotenv_config_path=.env.production
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function header(s: string) { console.log(`\n=== ${s} ===`) }
function pad(s: string | null | undefined, n: number) {
  return (s || '').toString().padEnd(n).slice(0, n)
}
function daysAgo(d: Date | null) {
  if (!d) return '—'
  const ms = Date.now() - d.getTime()
  const days = Math.floor(ms / 86400000)
  if (days === 0) {
    const hours = Math.floor(ms / 3600000)
    return `${hours}h ago`
  }
  return `${days}d ago`
}

async function main() {
  header('Stuck training enrollments (in_progress, zero sections completed)')

  const enrollments = await prisma.trainingEnrollment.findMany({
    where: {
      status: 'in_progress',
      completedAt: null,
    },
    include: {
      training: { select: { id: true, title: true, slug: true, sections: { select: { id: true } } } },
      session: {
        select: {
          id: true, candidateName: true, candidateEmail: true,
          pipelineStatus: true, workspaceId: true, startedAt: true,
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  })

  console.log(`Total in_progress enrollments: ${enrollments.length}`)

  type Bucket = 'never_started' | 'partial' | 'no_session'
  const rows: Array<{
    bucket: Bucket
    enrollmentId: string
    candidate: string
    email: string
    training: string
    pipelineStatus: string
    startedAt: Date
    completedSections: number
    totalSections: number
    sessionId: string | null
    workspaceId: string | null
  }> = []

  for (const e of enrollments) {
    const progress = (e.progress as { completedSections?: string[] } | null) || null
    const completed = progress?.completedSections?.length ?? 0
    const total = e.training.sections.length

    let bucket: Bucket = 'partial'
    if (!e.session) bucket = 'no_session'
    else if (completed === 0) bucket = 'never_started'

    rows.push({
      bucket,
      enrollmentId: e.id,
      candidate: e.session?.candidateName || e.userName || '—',
      email: e.session?.candidateEmail || e.userEmail || '—',
      training: e.training.title,
      pipelineStatus: e.session?.pipelineStatus || '—',
      startedAt: e.startedAt,
      completedSections: completed,
      totalSections: total,
      sessionId: e.session?.id || null,
      workspaceId: e.session?.workspaceId || null,
    })
  }

  // ── Bucket 1: zero sections completed (most likely the bug-affected group)
  const neverStarted = rows.filter(r => r.bucket === 'never_started')
  header(`Never advanced past landing page  (${neverStarted.length} candidates)`)
  console.log('These reached the training URL but completed 0 sections.')
  console.log('Most likely watched the inline landing video and bailed thinking they were done.\n')
  console.log(
    pad('Candidate', 26),
    pad('Email', 32),
    pad('Pipeline', 22),
    pad('Training', 28),
    pad('Started', 12),
  )
  console.log('-'.repeat(120))
  for (const r of neverStarted) {
    console.log(
      pad(r.candidate, 26),
      pad(r.email, 32),
      pad(r.pipelineStatus, 22),
      pad(r.training, 28),
      pad(daysAgo(r.startedAt), 12),
    )
  }

  // ── Bucket 2: started some sections but not all
  const partial = rows.filter(r => r.bucket === 'partial')
  header(`Partial progress  (${partial.length} candidates)`)
  console.log('Completed some sections but not all — different problem (drop-off, not the inline-video bug).\n')
  console.log(
    pad('Candidate', 26),
    pad('Email', 32),
    pad('Sections', 12),
    pad('Pipeline', 22),
    pad('Started', 12),
  )
  console.log('-'.repeat(120))
  for (const r of partial) {
    console.log(
      pad(r.candidate, 26),
      pad(r.email, 32),
      pad(`${r.completedSections}/${r.totalSections}`, 12),
      pad(r.pipelineStatus, 22),
      pad(daysAgo(r.startedAt), 12),
    )
  }

  // ── Bucket 3: no session attached (orphan / preview / no candidate row)
  const orphan = rows.filter(r => r.bucket === 'no_session')
  if (orphan.length > 0) {
    header(`Orphan enrollments without sessions  (${orphan.length})`)
    console.log('No candidate session linked — likely preview or imported.\n')
    for (const r of orphan) {
      console.log(`  ${r.enrollmentId}  ${r.email}  ${r.training}`)
    }
  }

  // ── Summary
  header('Summary')
  console.log(`  Never advanced past landing : ${neverStarted.length}  ← prime candidates for re-outreach`)
  console.log(`  Partial progress            : ${partial.length}`)
  console.log(`  Orphan (no session)         : ${orphan.length}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect()
  process.exit(1)
})
