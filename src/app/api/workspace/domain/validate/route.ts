import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateDomain } from '@/lib/sendgrid-domain'

export async function POST() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const workspace = await prisma.workspace.findUnique({
    where: { id: ws.workspaceId },
    select: { senderDomainId: true },
  })
  if (!workspace?.senderDomainId) {
    return NextResponse.json({ error: 'No domain to validate' }, { status: 400 })
  }

  try {
    const { valid, validationResults } = await validateDomain(workspace.senderDomainId)
    await prisma.workspace.update({
      where: { id: ws.workspaceId },
      data: { senderDomainValidatedAt: valid ? new Date() : null },
    })
    return NextResponse.json({ valid, validationResults })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Validation failed' }, { status: 400 })
  }
}
