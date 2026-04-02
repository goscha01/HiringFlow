import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const templates = await prisma.emailTemplate.findMany({ where: { ownerUserId: session.user.id }, orderBy: { updatedAt: 'desc' } })
  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, subject, bodyHtml, bodyText } = await request.json()
  if (!name || !subject || !bodyHtml) return NextResponse.json({ error: 'name, subject, bodyHtml required' }, { status: 400 })
  const template = await prisma.emailTemplate.create({
    data: { ownerUserId: session.user.id, name, subject, bodyHtml, bodyText: bodyText || null },
  })
  return NextResponse.json(template)
}
