import { NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Lists the entities a stage trigger can target (per-flow and per-training
// granularity). Used by the StageSettingsDrawer trigger picker.
export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const [flows, trainings] = await Promise.all([
    prisma.flow.findMany({
      where: { workspaceId: ws.workspaceId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.training.findMany({
      where: { workspaceId: ws.workspaceId },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return NextResponse.json({
    flows: flows.map(f => ({ id: f.id, label: f.name })),
    trainings: trainings.map(t => ({ id: t.id, label: t.title })),
  })
}
