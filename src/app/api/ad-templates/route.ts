import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const templates = await prisma.adTemplate.findMany({
    where: { workspaceId: ws.workspaceId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { name, source, headline, bodyText, requirements, benefits, callToAction } = await request.json()
  if (!name || !headline || !bodyText) return NextResponse.json({ error: 'name, headline, bodyText required' }, { status: 400 })

  const template = await prisma.adTemplate.create({
    data: {
      workspaceId: ws.workspaceId,
      createdById: ws.userId,
      name,
      source: source || 'general',
      headline,
      bodyText,
      requirements: requirements || null,
      benefits: benefits || null,
      callToAction: callToAction || null,
    },
  })

  return NextResponse.json(template)
}
