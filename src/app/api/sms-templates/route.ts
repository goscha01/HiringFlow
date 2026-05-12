import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()
  const templates = await prisma.smsTemplate.findMany({ where: { workspaceId: ws.workspaceId }, orderBy: { updatedAt: 'desc' } })
  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()
  const { name, body } = await request.json()
  if (!name || !body) return NextResponse.json({ error: 'name, body required' }, { status: 400 })
  const template = await prisma.smsTemplate.create({
    data: { workspaceId: ws.workspaceId, createdById: ws.userId, name, body },
  })
  return NextResponse.json(template)
}
