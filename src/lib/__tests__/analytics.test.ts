import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { getFunnelMetrics, getSourceMetrics, getAdMetrics } from '../analytics'

const prisma = new PrismaClient()

let wsA: { id: string }
let wsB: { id: string }
let userA: { id: string }
let userB: { id: string }
let flowA: { id: string }
let flowB: { id: string }
let adA: { id: string }

beforeAll(async () => {
  const hash = await bcrypt.hash('test123', 12)

  userA = await prisma.user.create({ data: { email: `ana-a-${nanoid(6)}@test.com`, passwordHash: hash } })
  userB = await prisma.user.create({ data: { email: `ana-b-${nanoid(6)}@test.com`, passwordHash: hash } })

  wsA = await prisma.workspace.create({ data: { name: 'Analytics Biz A', slug: `ana-a-${nanoid(6)}` } })
  wsB = await prisma.workspace.create({ data: { name: 'Analytics Biz B', slug: `ana-b-${nanoid(6)}` } })

  flowA = await prisma.flow.create({ data: { workspaceId: wsA.id, createdById: userA.id, name: 'Flow A', slug: `af-a-${nanoid(6)}` } })
  flowB = await prisma.flow.create({ data: { workspaceId: wsB.id, createdById: userB.id, name: 'Flow B', slug: `af-b-${nanoid(6)}` } })

  adA = await prisma.ad.create({ data: { workspaceId: wsA.id, createdById: userA.id, name: 'Indeed Ad', source: 'indeed', flowId: flowA.id, slug: `aa-${nanoid(6)}` } })

  // Workspace A: 5 sessions with different pipeline statuses
  await prisma.session.createMany({
    data: [
      { workspaceId: wsA.id, flowId: flowA.id, adId: adA.id, source: 'indeed', candidateName: 'C1', outcome: 'completed', pipelineStatus: 'completed_flow' },
      { workspaceId: wsA.id, flowId: flowA.id, adId: adA.id, source: 'indeed', candidateName: 'C2', outcome: 'passed', pipelineStatus: 'training_completed' },
      { workspaceId: wsA.id, flowId: flowA.id, adId: adA.id, source: 'indeed', candidateName: 'C3', outcome: 'passed', pipelineStatus: 'scheduled' },
      { workspaceId: wsA.id, flowId: flowA.id, source: 'facebook', candidateName: 'C4', outcome: 'passed', pipelineStatus: 'invited_to_schedule' },
      { workspaceId: wsA.id, flowId: flowA.id, candidateName: 'C5' }, // started only, no ad
    ],
  })

  // Workspace B: 2 sessions (should NOT appear in workspace A analytics)
  await prisma.session.createMany({
    data: [
      { workspaceId: wsB.id, flowId: flowB.id, candidateName: 'B1', outcome: 'completed', pipelineStatus: 'completed_flow' },
      { workspaceId: wsB.id, flowId: flowB.id, candidateName: 'B2', outcome: 'passed', pipelineStatus: 'scheduled' },
    ],
  })
})

afterAll(async () => {
  await prisma.session.deleteMany({ where: { workspaceId: { in: [wsA.id, wsB.id] } } })
  await prisma.ad.deleteMany({ where: { workspaceId: { in: [wsA.id, wsB.id] } } })
  await prisma.flow.deleteMany({ where: { workspaceId: { in: [wsA.id, wsB.id] } } })
  await prisma.workspace.deleteMany({ where: { id: { in: [wsA.id, wsB.id] } } })
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } })
  await prisma.$disconnect()
})

describe('getFunnelMetrics', () => {
  it('returns correct counts for workspace A', async () => {
    const f = await getFunnelMetrics(wsA.id)
    expect(f.started).toBe(5)
    expect(f.completed).toBe(4) // 1 completed + 3 passed
    expect(f.passed).toBe(3)
    expect(f.trainingCompleted).toBe(3) // training_completed + invited + scheduled
    expect(f.invitedToSchedule).toBe(2) // invited + scheduled
    expect(f.scheduled).toBe(1)
  })

  it('returns correct counts for workspace B (isolated)', async () => {
    const f = await getFunnelMetrics(wsB.id)
    expect(f.started).toBe(2)
    expect(f.completed).toBe(2)
    expect(f.passed).toBe(1)
    expect(f.scheduled).toBe(1)
  })

  it('workspace A does not include workspace B data', async () => {
    const fA = await getFunnelMetrics(wsA.id)
    const fB = await getFunnelMetrics(wsB.id)
    expect(fA.started).toBe(5)
    expect(fB.started).toBe(2)
    expect(fA.started + fB.started).toBe(7) // total across both
  })
})

describe('getSourceMetrics', () => {
  it('groups by source correctly for workspace A', async () => {
    const sources = await getSourceMetrics(wsA.id)
    expect(sources.length).toBeGreaterThanOrEqual(2) // indeed, facebook, possibly direct

    const indeed = sources.find(s => s.source === 'indeed')
    expect(indeed).toBeTruthy()
    expect(indeed!.started).toBe(3) // C1, C2, C3

    const facebook = sources.find(s => s.source === 'facebook')
    expect(facebook).toBeTruthy()
    expect(facebook!.started).toBe(1) // C4
  })

  it('workspace B sources are separate', async () => {
    const sources = await getSourceMetrics(wsB.id)
    const direct = sources.find(s => s.source === 'direct')
    expect(direct).toBeTruthy()
    expect(direct!.started).toBe(2)
  })
})

describe('getAdMetrics', () => {
  it('returns per-ad breakdown for workspace A', async () => {
    const ads = await getAdMetrics(wsA.id)
    const indeedAd = ads.find(a => a.adName === 'Indeed Ad')
    expect(indeedAd).toBeTruthy()
    expect(indeedAd!.started).toBe(3) // C1, C2, C3
    expect(indeedAd!.passed).toBe(2) // C2, C3
    expect(indeedAd!.scheduled).toBe(1) // C3
  })

  it('includes direct traffic entry for workspace A', async () => {
    const ads = await getAdMetrics(wsA.id)
    const direct = ads.find(a => a.adId === 'direct')
    // C4 has no adId but has source=facebook, C5 has no adId and no source
    expect(direct).toBeTruthy()
    expect(direct!.started).toBe(2) // C4, C5
  })

  it('workspace B sees no ads from workspace A', async () => {
    const ads = await getAdMetrics(wsB.id)
    const indeedAd = ads.find(a => a.adName === 'Indeed Ad')
    expect(indeedAd).toBeUndefined()
  })
})
