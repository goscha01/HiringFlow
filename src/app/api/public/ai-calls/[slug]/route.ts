import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET — fetch call config + candidate's call history
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const candidateEmail = request.nextUrl.searchParams.get('email')

  const config = await prisma.aICallConfig.findUnique({
    where: { slug: params.slug },
  })

  if (!config || !config.isActive) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let calls: any[] = []
  if (candidateEmail) {
    calls = await prisma.aICall.findMany({
      where: { configId: config.id, candidateEmail },
      orderBy: { createdAt: 'asc' },
    })
  }

  return NextResponse.json({
    id: config.id,
    name: config.name,
    agentId: config.agentId,
    requiredCalls: config.requiredCalls,
    completedCalls: calls.filter(c => c.status === 'completed').length,
    calls,
  })
}

// POST — log a call event (start, complete)
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const config = await prisma.aICallConfig.findUnique({ where: { slug: params.slug } })
  if (!config || !config.isActive) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { action, candidateName, candidateEmail, callId, durationSecs, transcript, evaluation } = await request.json()

  if (action === 'start') {
    // Count existing calls for this candidate
    const existing = await prisma.aICall.count({
      where: { configId: config.id, candidateEmail },
    })

    const call = await prisma.aICall.create({
      data: {
        configId: config.id,
        candidateName,
        candidateEmail,
        callNumber: existing + 1,
        status: 'in_progress',
        startedAt: new Date(),
      },
    })

    return NextResponse.json({ callId: call.id, callNumber: call.callNumber })
  }

  if (action === 'complete' && callId) {
    const call = await prisma.aICall.update({
      where: { id: callId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        durationSecs: durationSecs || null,
        transcript: transcript || null,
        evaluation: evaluation || null,
      },
    })

    const completedCount = await prisma.aICall.count({
      where: { configId: config.id, candidateEmail, status: 'completed' },
    })

    return NextResponse.json({
      callId: call.id,
      completedCalls: completedCount,
      requiredCalls: config.requiredCalls,
      allDone: completedCount >= config.requiredCalls,
    })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
