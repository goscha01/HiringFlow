import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBookingRules } from '@/lib/scheduling/booking-rules'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const config = await prisma.schedulingConfig.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()

  // If setting as default, clear existing defaults
  if (body.isDefault === true) {
    await prisma.schedulingConfig.updateMany({
      where: { workspaceId: ws.workspaceId, isDefault: true, id: { not: params.id } },
      data: { isDefault: false },
    })
  }

  // Validate bookingRules if present. Reject the whole PATCH on bad shape so
  // we never persist a malformed blob the slot computer can't read.
  let bookingRulesUpdate: Prisma.InputJsonValue | undefined
  if (body.bookingRules !== undefined) {
    try {
      bookingRulesUpdate = parseBookingRules(body.bookingRules) as unknown as Prisma.InputJsonValue
    } catch (err) {
      return NextResponse.json({ error: 'invalid_booking_rules', message: (err as Error).message }, { status: 400 })
    }
  }

  const updated = await prisma.schedulingConfig.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.schedulingUrl !== undefined && { schedulingUrl: body.schedulingUrl }),
      ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.useBuiltInScheduler !== undefined && { useBuiltInScheduler: !!body.useBuiltInScheduler }),
      ...(bookingRulesUpdate !== undefined && { bookingRules: bookingRulesUpdate }),
      ...(body.calendarId !== undefined && { calendarId: body.calendarId || null }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const config = await prisma.schedulingConfig.findFirst({ where: { id: params.id, workspaceId: ws.workspaceId } })
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.schedulingConfig.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
