import { prisma } from '../src/lib/prisma'
import { parseBookingRulesOrDefault } from '../src/lib/scheduling/booking-rules'
import { computeAvailableSlots } from '../src/lib/scheduling/slot-computer'

async function main() {
  const cfg = await prisma.schedulingConfig.findFirst({
    where: { useBuiltInScheduler: true },
    include: { workspace: { select: { timezone: true, name: true } } },
  })
  if (!cfg) { console.error('no built-in config'); process.exit(1) }

  const rules = parseBookingRulesOrDefault(cfg.bookingRules)
  console.log('Workspace:', cfg.workspace.name, '(', cfg.workspace.timezone, ')')
  console.log('Rules:', JSON.stringify(rules, null, 2))

  // Pretend recruiter has 2 busy blocks today + tomorrow.
  const now = new Date()
  const busy = [
    { start: new Date(now.getTime() + 2 * 60 * 60_000), end: new Date(now.getTime() + 3 * 60 * 60_000) },
    { start: new Date(now.getTime() + 26 * 60 * 60_000), end: new Date(now.getTime() + 27 * 60 * 60_000) },
  ]

  const slots = computeAvailableSlots({
    rules,
    recruiterTimezone: cfg.workspace.timezone,
    busyIntervals: busy,
    nowUtc: now,
    maxSlots: 12,
  })

  console.log('\nFirst 12 slots (UTC):')
  for (const s of slots) {
    const recruiterLocal = s.startUtc.toLocaleString('en-US', { timeZone: cfg.workspace.timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    console.log(`  ${s.startUtc.toISOString()}  →  ${recruiterLocal} ${cfg.workspace.timezone}`)
  }
  console.log(`\nTotal returned: ${slots.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
