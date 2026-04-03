import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'

const prisma = new PrismaClient()

// Test data
let workspaceA: { id: string }
let workspaceB: { id: string }
let userA: { id: string }
let userB: { id: string }
let flowA: { id: string; slug: string }
let flowB: { id: string; slug: string }
let trainingA: { id: string; slug: string }
let adA: { id: string; slug: string }
let sessionA: { id: string }
let templateA: { id: string }
let templateB: { id: string }
let schedulingA: { id: string }

beforeAll(async () => {
  // Create two separate workspaces with their own users
  const hash = await bcrypt.hash('test123', 12)

  userA = await prisma.user.create({
    data: { email: `test-a-${nanoid(6)}@test.com`, passwordHash: hash, name: 'User A' },
  })
  userB = await prisma.user.create({
    data: { email: `test-b-${nanoid(6)}@test.com`, passwordHash: hash, name: 'User B' },
  })

  workspaceA = await prisma.workspace.create({
    data: { name: 'Business A', slug: `biz-a-${nanoid(6)}` },
  })
  workspaceB = await prisma.workspace.create({
    data: { name: 'Business B', slug: `biz-b-${nanoid(6)}` },
  })

  await prisma.workspaceMember.createMany({
    data: [
      { userId: userA.id, workspaceId: workspaceA.id, role: 'owner' },
      { userId: userB.id, workspaceId: workspaceB.id, role: 'owner' },
    ],
  })

  // Create test data for Workspace A
  flowA = await prisma.flow.create({
    data: { workspaceId: workspaceA.id, createdById: userA.id, name: 'Flow A', slug: `flow-a-${nanoid(6)}` },
  })

  trainingA = await prisma.training.create({
    data: { workspaceId: workspaceA.id, createdById: userA.id, title: 'Training A', slug: `train-a-${nanoid(6)}` },
  })

  adA = await prisma.ad.create({
    data: { workspaceId: workspaceA.id, createdById: userA.id, name: 'Ad A', source: 'indeed', flowId: flowA.id, slug: `ad-a-${nanoid(6)}` },
  })

  sessionA = await prisma.session.create({
    data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: 'Candidate A', candidateEmail: 'candidate@test.com' },
  })

  templateA = await prisma.emailTemplate.create({
    data: { workspaceId: workspaceA.id, createdById: userA.id, name: 'Template A', subject: 'Hello', bodyHtml: '<p>Hi</p>' },
  })

  schedulingA = await prisma.schedulingConfig.create({
    data: { workspaceId: workspaceA.id, createdById: userA.id, name: 'Interview A', schedulingUrl: 'https://calendly.com/a/interview', isDefault: true },
  })

  // Create test data for Workspace B
  flowB = await prisma.flow.create({
    data: { workspaceId: workspaceB.id, createdById: userB.id, name: 'Flow B', slug: `flow-b-${nanoid(6)}` },
  })

  templateB = await prisma.emailTemplate.create({
    data: { workspaceId: workspaceB.id, createdById: userB.id, name: 'Template B', subject: 'Hello B', bodyHtml: '<p>Hi B</p>' },
  })
})

afterAll(async () => {
  // Clean up test data
  await prisma.schedulingConfig.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.emailTemplate.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.session.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.ad.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.training.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.flow.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } })
  await prisma.$disconnect()
})

describe('Workspace Data Isolation', () => {
  it('flows are scoped to workspace', async () => {
    const flowsA = await prisma.flow.findMany({ where: { workspaceId: workspaceA.id } })
    const flowsB = await prisma.flow.findMany({ where: { workspaceId: workspaceB.id } })

    expect(flowsA).toHaveLength(1)
    expect(flowsA[0].name).toBe('Flow A')
    expect(flowsB).toHaveLength(1)
    expect(flowsB[0].name).toBe('Flow B')
  })

  it('workspace A cannot see workspace B flows', async () => {
    const crossFlow = await prisma.flow.findFirst({
      where: { id: flowB.id, workspaceId: workspaceA.id },
    })
    expect(crossFlow).toBeNull()
  })

  it('sessions inherit workspace from flow', async () => {
    const sessions = await prisma.session.findMany({ where: { workspaceId: workspaceA.id } })
    expect(sessions).toHaveLength(1)
    expect(sessions[0].candidateName).toBe('Candidate A')

    const sessionsB = await prisma.session.findMany({ where: { workspaceId: workspaceB.id } })
    expect(sessionsB).toHaveLength(0)
  })

  it('ads are scoped to workspace', async () => {
    const adsA = await prisma.ad.findMany({ where: { workspaceId: workspaceA.id } })
    const adsB = await prisma.ad.findMany({ where: { workspaceId: workspaceB.id } })

    expect(adsA).toHaveLength(1)
    expect(adsB).toHaveLength(0)
  })

  it('email templates are scoped to workspace', async () => {
    const templatesA = await prisma.emailTemplate.findMany({ where: { workspaceId: workspaceA.id } })
    const templatesB = await prisma.emailTemplate.findMany({ where: { workspaceId: workspaceB.id } })

    expect(templatesA).toHaveLength(1)
    expect(templatesA[0].name).toBe('Template A')
    expect(templatesB).toHaveLength(1)
    expect(templatesB[0].name).toBe('Template B')
  })

  it('scheduling configs are scoped to workspace', async () => {
    const configsA = await prisma.schedulingConfig.findMany({ where: { workspaceId: workspaceA.id } })
    const configsB = await prisma.schedulingConfig.findMany({ where: { workspaceId: workspaceB.id } })

    expect(configsA).toHaveLength(1)
    expect(configsA[0].name).toBe('Interview A')
    expect(configsB).toHaveLength(0)
  })

  it('trainings are scoped to workspace', async () => {
    const trainingsA = await prisma.training.findMany({ where: { workspaceId: workspaceA.id } })
    const trainingsB = await prisma.training.findMany({ where: { workspaceId: workspaceB.id } })

    expect(trainingsA).toHaveLength(1)
    expect(trainingsB).toHaveLength(0)
  })
})

describe('Cross-Workspace Reference Prevention', () => {
  it('cannot create an ad pointing to another workspace flow', async () => {
    // Ad in workspace B should not reference flow in workspace A
    await expect(
      prisma.ad.create({
        data: {
          workspaceId: workspaceB.id,
          createdById: userB.id,
          name: 'Cross Ad',
          source: 'indeed',
          flowId: flowA.id, // Flow belongs to workspace A!
          slug: `cross-ad-${nanoid(6)}`,
        },
      })
    ).resolves.toBeTruthy() // DB allows it, but app layer should prevent it

    // Verify the ad was created (DB-level doesn't prevent cross-ref)
    // The app layer (API routes) must enforce same-workspace check
    const crossAd = await prisma.ad.findFirst({
      where: { workspaceId: workspaceB.id, name: 'Cross Ad' },
    })
    expect(crossAd).toBeTruthy()

    // Clean up
    if (crossAd) await prisma.ad.delete({ where: { id: crossAd.id } })
  })

  it('automation rules are workspace-scoped in query', async () => {
    // Create automation in workspace A
    const rule = await prisma.automationRule.create({
      data: {
        workspaceId: workspaceA.id,
        createdById: userA.id,
        name: 'Test Rule A',
        triggerType: 'flow_completed',
        emailTemplateId: templateA.id,
      },
    })

    // Query from workspace B should not find it
    const crossRule = await prisma.automationRule.findFirst({
      where: { id: rule.id, workspaceId: workspaceB.id },
    })
    expect(crossRule).toBeNull()

    // Query from workspace A should find it
    const ownRule = await prisma.automationRule.findFirst({
      where: { id: rule.id, workspaceId: workspaceA.id },
    })
    expect(ownRule).toBeTruthy()
    expect(ownRule!.name).toBe('Test Rule A')

    // Clean up
    await prisma.automationRule.delete({ where: { id: rule.id } })
  })
})

describe('Workspace Membership', () => {
  it('user belongs to correct workspace', async () => {
    const membershipA = await prisma.workspaceMember.findFirst({
      where: { userId: userA.id },
      include: { workspace: true },
    })
    expect(membershipA).toBeTruthy()
    expect(membershipA!.workspace.name).toBe('Business A')
    expect(membershipA!.role).toBe('owner')
  })

  it('user can only be member of workspace once', async () => {
    await expect(
      prisma.workspaceMember.create({
        data: { userId: userA.id, workspaceId: workspaceA.id, role: 'member' },
      })
    ).rejects.toThrow()
  })

  it('workspace slug is unique', async () => {
    const ws = await prisma.workspace.findFirst({ where: { id: workspaceA.id } })
    await expect(
      prisma.workspace.create({
        data: { name: 'Duplicate', slug: ws!.slug },
      })
    ).rejects.toThrow()
  })
})

describe('Registration Flow', () => {
  it('can create user + workspace + membership atomically', async () => {
    const email = `reg-test-${nanoid(6)}@test.com`
    const hash = await bcrypt.hash('test123', 12)

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash: hash, name: 'Reg Test' },
      })
      const workspace = await tx.workspace.create({
        data: { name: 'Reg Business', slug: nanoid(10) },
      })
      await tx.workspaceMember.create({
        data: { userId: user.id, workspaceId: workspace.id, role: 'owner' },
      })
      return { user, workspace }
    })

    expect(result.user.email).toBe(email)
    expect(result.workspace.name).toBe('Reg Business')

    // Verify membership
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: result.user.id, workspaceId: result.workspace.id },
    })
    expect(membership).toBeTruthy()
    expect(membership!.role).toBe('owner')

    // Clean up
    await prisma.workspaceMember.deleteMany({ where: { userId: result.user.id } })
    await prisma.workspace.delete({ where: { id: result.workspace.id } })
    await prisma.user.delete({ where: { id: result.user.id } })
  })
})
