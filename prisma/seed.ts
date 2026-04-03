import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.ADMIN_PASSWORD || 'changeme123'

  const passwordHash = await bcrypt.hash(password, 12)

  // Create or find user
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: 'Admin',
    },
  })

  // Create default workspace if user has no memberships
  const existingMembership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
  })

  if (!existingMembership) {
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Default Workspace',
        slug: nanoid(10),
      },
    })

    await prisma.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: 'owner',
      },
    })

    console.log(`Workspace created: ${workspace.name} (${workspace.id})`)

    // Migrate existing data to this workspace
    await migrateExistingData(user.id, workspace.id)
  }

  console.log(`Admin user ready: ${user.email}`)
}

/**
 * Migrate existing ownerUserId-based records to workspace.
 * This handles the transition from single-user to multi-workspace.
 */
async function migrateExistingData(userId: string, workspaceId: string) {
  // Migrate videos
  const videos = await prisma.$executeRawUnsafe(
    `UPDATE videos SET workspace_id = $1, created_by_id = $2 WHERE workspace_id IS NULL`,
    workspaceId, userId
  )
  console.log(`Migrated ${videos} videos`)

  // Migrate flows
  const flows = await prisma.$executeRawUnsafe(
    `UPDATE flows SET workspace_id = $1, created_by_id = $2 WHERE workspace_id IS NULL`,
    workspaceId, userId
  )
  console.log(`Migrated ${flows} flows`)

  // Migrate ads
  const ads = await prisma.$executeRawUnsafe(
    `UPDATE ads SET workspace_id = $1, created_by_id = $2 WHERE workspace_id IS NULL`,
    workspaceId, userId
  )
  console.log(`Migrated ${ads} ads`)

  // Migrate sessions (inherit from their flow's workspace)
  const sessions = await prisma.$executeRawUnsafe(
    `UPDATE sessions SET workspace_id = $1 WHERE workspace_id IS NULL`,
    workspaceId
  )
  console.log(`Migrated ${sessions} sessions`)

  // Migrate trainings
  const trainings = await prisma.$executeRawUnsafe(
    `UPDATE trainings SET workspace_id = $1, created_by_id = $2 WHERE workspace_id IS NULL`,
    workspaceId, userId
  )
  console.log(`Migrated ${trainings} trainings`)

  // Migrate email templates
  const templates = await prisma.$executeRawUnsafe(
    `UPDATE email_templates SET workspace_id = $1, created_by_id = $2 WHERE workspace_id IS NULL`,
    workspaceId, userId
  )
  console.log(`Migrated ${templates} email templates`)

  // Migrate automation rules
  const rules = await prisma.$executeRawUnsafe(
    `UPDATE automation_rules SET workspace_id = $1, created_by_id = $2 WHERE workspace_id IS NULL`,
    workspaceId, userId
  )
  console.log(`Migrated ${rules} automation rules`)

  // Migrate scheduling configs
  const configs = await prisma.$executeRawUnsafe(
    `UPDATE scheduling_configs SET workspace_id = $1, created_by_id = $2 WHERE workspace_id IS NULL`,
    workspaceId, userId
  )
  console.log(`Migrated ${configs} scheduling configs`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
