import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const ad = await prisma.ad.findUnique({
    where: { slug: params.slug },
    include: {
      flow: {
        include: {
          steps: { orderBy: { stepOrder: 'asc' }, take: 1 },
        },
      },
    },
  })

  if (!ad || !ad.isActive) {
    return NextResponse.json({ error: 'Ad not found or inactive' }, { status: 404 })
  }

  if (!ad.flow.isPublished) {
    return NextResponse.json({ error: 'Flow not published' }, { status: 404 })
  }

  return NextResponse.json({
    adId: ad.id,
    adName: ad.name,
    source: ad.source,
    campaign: ad.campaign,
    flow: {
      id: ad.flow.id,
      name: ad.flow.name,
      slug: ad.flow.slug,
      startMessage: ad.flow.startMessage,
      endMessage: ad.flow.endMessage,
      branding: ad.flow.branding,
      startStepId: ad.flow.steps[0]?.id || null,
    },
  })
}
