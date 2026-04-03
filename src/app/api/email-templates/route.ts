import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()
  const templates = await prisma.emailTemplate.findMany({ where: { workspaceId: ws.workspaceId }, orderBy: { updatedAt: 'desc' } })
  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()
  const { name, subject, bodyHtml, bodyText } = await request.json()
  if (!name || !subject || !bodyHtml) return NextResponse.json({ error: 'name, subject, bodyHtml required' }, { status: 400 })
  const template = await prisma.emailTemplate.create({
    data: { workspaceId: ws.workspaceId, createdById: ws.userId, name, subject, bodyHtml, bodyText: bodyText || null },
  })
  return NextResponse.json(template)
}
