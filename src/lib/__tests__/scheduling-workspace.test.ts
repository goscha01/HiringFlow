import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { resolveSchedulingUrl } from '../scheduling'

const prisma = new PrismaClient()

let workspaceA: { id: string }
let workspaceB: { id: string }
let userA: { id: string }
let userB: { id: string }
let configA: { id: string }
let configB: { id: string }

beforeAll(async () => {
  const hash = await bcrypt.hash('test123', 12)

  userA = await prisma.user.create({
    data: { email: `sched-a-${nanoid(6)}@test.com`, passwordHash: hash },
  })
  userB = await prisma.user.create({
    data: { email: `sched-b-${nanoid(6)}@test.com`, passwordHash: hash },
  })

  workspaceA = await prisma.workspace.create({
    data: { name: 'Sched Biz A', slug: `sched-a-${nanoid(6)}` },
  })
  workspaceB = await prisma.workspace.create({
    data: { name: 'Sched Biz B', slug: `sched-b-${nanoid(6)}` },
  })

  configA = await prisma.schedulingConfig.create({
    data: {
      workspaceId: workspaceA.id,
      createdById: userA.id,
      name: 'Interview A',
      schedulingUrl: 'https://calendly.com/biz-a/interview',
      isDefault: true,
      isActive: true,
    },
  })

  configB = await prisma.schedulingConfig.create({
    data: {
      workspaceId: workspaceB.id,
      createdById: userB.id,
      name: 'Interview B',
      schedulingUrl: 'https://calendly.com/biz-b/interview',
      isDefault: true,
      isActive: true,
    },
  })
})

afterAll(async () => {
  await prisma.schedulingConfig.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } })
  await prisma.$disconnect()
})

describe('resolveSchedulingUrl workspace scoping', () => {
  it('resolves specific config by ID', async () => {
    const result = await resolveSchedulingUrl(configA.id, workspaceA.id)
    expect(result).toBeTruthy()
    expect(result!.url).toBe('https://calendly.com/biz-a/interview')
    expect(result!.configId).toBe(configA.id)
  })

  it('falls back to workspace default when no configId', async () => {
    const result = await resolveSchedulingUrl(null, workspaceA.id)
    expect(result).toBeTruthy()
    expect(result!.url).toBe('https://calendly.com/biz-a/interview')
  })

  it('resolves workspace B default independently', async () => {
    const result = await resolveSchedulingUrl(null, workspaceB.id)
    expect(result).toBeTruthy()
    expect(result!.url).toBe('https://calendly.com/biz-b/interview')
  })

  it('returns null without workspaceId and no configId', async () => {
    const result = await resolveSchedulingUrl(null)
    expect(result).toBeNull()
  })

  it('does not leak workspace A config into workspace B fallback', async () => {
    // Even if configA is active and default, workspace B should only see configB
    const result = await resolveSchedulingUrl(null, workspaceB.id)
    expect(result!.url).toBe('https://calendly.com/biz-b/interview')
    expect(result!.configId).toBe(configB.id)
  })
})
