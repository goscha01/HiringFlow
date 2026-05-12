import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DEFAULT_SMS_TEMPLATES } from '@/lib/sms-templates-seed'

export async function POST() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const existing = await prisma.smsTemplate.findMany({
    where: { workspaceId: ws.workspaceId },
    select: { name: true },
  })
  const existingNames = new Set(existing.map(e => e.name))

  const toCreate = DEFAULT_SMS_TEMPLATES.filter(t => !existingNames.has(t.name))
  if (toCreate.length === 0) {
    return NextResponse.json({ created: 0, skipped: DEFAULT_SMS_TEMPLATES.length })
  }

  await prisma.smsTemplate.createMany({
    data: toCreate.map(t => ({
      workspaceId: ws.workspaceId,
      createdById: ws.userId,
      name: t.name,
      body: t.body,
    })),
  })

  return NextResponse.json({ created: toCreate.length, skipped: existingNames.size })
}
