import { prisma } from '../src/lib/prisma'

async function main() {
  const ws = await prisma.workspace.findFirst()
  const user = await prisma.user.findFirst()
  if (!ws || !user) { console.error('no ws/user'); return }
  console.log('ws', ws.id, 'user', user.id)
  const flow = await prisma.flow.upsert({
    where: { slug: 'smoke' },
    update: {},
    create: { workspaceId: ws.id, createdById: user.id, name: 'Smoke Flow', slug: 'smoke', isPublished: true },
  })
  console.log('flow created', flow.id)
  const session = await prisma.session.create({
    data: {
      workspaceId: ws.id,
      flowId: flow.id,
      candidateName: 'Smoke Test',
      candidateEmail: 'smoke@example.com',
      candidatePhone: '+15555550101',
      pipelineStatus: 'training_completed',
    },
  })
  console.log('session created', session.id)
  const calendlyCfg = await prisma.schedulingConfig.create({
    data: {
      workspaceId: ws.id,
      createdById: user.id,
      name: 'Calendly Path',
      provider: 'calendly',
      schedulingUrl: 'https://calendly.com/example/30min',
      useBuiltInScheduler: false,
      isActive: true,
      isDefault: true,
    },
  })
  const builtInCfg = await prisma.schedulingConfig.create({
    data: {
      workspaceId: ws.id,
      createdById: user.id,
      name: 'Built-in Path',
      provider: 'calendly',
      schedulingUrl: 'unused',
      useBuiltInScheduler: true,
      bookingRules: {
        durationMinutes: 30,
        slotIntervalMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 15,
        minNoticeHours: 2,
        maxDaysOut: 14,
        workingHours: {
          mon: [{ start: '09:00', end: '17:00' }],
          tue: [{ start: '09:00', end: '17:00' }],
          wed: [{ start: '09:00', end: '17:00' }],
          thu: [{ start: '09:00', end: '17:00' }],
          fri: [{ start: '09:00', end: '17:00' }],
          sat: [],
          sun: [],
        },
      },
      isActive: true,
      isDefault: false,
    },
  })
  console.log('SEEDED', JSON.stringify({ workspaceId: ws.id, sessionId: session.id, calendlyCfgId: calendlyCfg.id, builtInCfgId: builtInCfg.id }))
}

main().catch((e) => { console.error('SEED FAILED:', e); process.exit(1) }).finally(() => process.exit(0))
