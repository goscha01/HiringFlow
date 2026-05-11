/**
 * Clean up artifacts whose filename names a DIFFERENT candidate. Caused by
 * the Gemini Notes search not filtering by candidate name (every Notes doc
 * in the host's Drive that overlapped a meeting's window was attached to
 * that meeting). The recording search already filters by name, so this
 * mostly affects gemini_notes rows.
 *
 * Rule: delete an artifact when its filename parses to
 * `<NameA> and <NameB> - ...` and the candidate's name is NOT a substring
 * of any of the names. Keep filenames that don't parse (e.g. the
 * "Meeting started ..." pattern Meet uses for host-alone sessions, where
 * Drive doesn't know any candidate name).
 *
 * Idempotent.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function parseNames(filename: string): string[] | null {
  const m = filename.match(/^(.+?)\s+-\s+\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}\s+\S+\s+-\s+(Recording|Notes by Gemini|Transcript)\s*$/i)
  if (!m) return null
  const namesPart = m[1].trim()
  const normalized = namesPart.replace(/,\s+and\s+/gi, ' and ')
  return normalized.split(/\s+and\s+|,\s+/).map((n) => n.trim().toLowerCase()).filter(Boolean)
}

async function main() {
  const meetings = await prisma.interviewMeeting.findMany({
    select: {
      id: true,
      session: { select: { candidateName: true } },
      artifacts: { select: { id: true, kind: true, fileName: true } },
    },
  })

  let removed = 0, kept = 0, unparseable = 0
  for (const m of meetings) {
    const cand = (m.session?.candidateName || '').toLowerCase().trim()
    if (!cand) continue
    for (const a of m.artifacts) {
      if (!a.fileName) { kept++; continue }
      const names = parseNames(a.fileName)
      if (!names) {
        // Unparseable filename — keep (covers "Meeting started ..." and
        // other patterns where Drive doesn't include candidate names).
        unparseable++
        kept++
        continue
      }
      const matches = names.some((n) => n.includes(cand) || cand.includes(n))
      if (matches) { kept++; continue }
      console.log(`  DELETE  meeting=${m.id}  candidate="${cand}"  artifact=${a.id}  filename="${a.fileName?.slice(0, 70)}"`)
      await prisma.interviewMeetingArtifact.delete({ where: { id: a.id } })
      removed++
    }
  }

  console.log(`\nRemoved ${removed} wrong-candidate artifact(s); kept ${kept} (${unparseable} had unparseable names).`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
