import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET — list all AI call candidates for this workspace
export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const candidates = await prisma.aICallCandidate.findMany({
    where: { workspaceId: ws.workspaceId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(candidates)
}

// POST — save a candidate when admin copies link
export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const { name, agentId } = await request.json()
  if (!name || !agentId) return NextResponse.json({ error: 'name and agentId required' }, { status: 400 })

  const candidate = await prisma.aICallCandidate.create({
    data: {
      workspaceId: ws.workspaceId,
      name,
      agentId,
    },
  })

  return NextResponse.json(candidate)
}
