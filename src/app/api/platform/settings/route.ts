import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const sa = await getSuperAdminSession()
  if (!sa) return unauthorized()

  const settings = await prisma.platformSetting.findMany({
    orderBy: { key: 'asc' },
  })

  // Group by category
  const grouped: Record<string, Record<string, string>> = {}
  for (const s of settings) {
    if (!grouped[s.category]) grouped[s.category] = {}
    grouped[s.category][s.key] = s.value
  }

  return NextResponse.json(grouped)
}

export async function PUT(request: NextRequest) {
  const sa = await getSuperAdminSession()
  if (!sa) return unauthorized()

  const body = await request.json() as Record<string, Record<string, string>>

  for (const [category, entries] of Object.entries(body)) {
    for (const [key, value] of Object.entries(entries)) {
      await prisma.platformSetting.upsert({
        where: { key },
        create: { key, value: value || '', category },
        update: { value: value || '', category },
      })
    }
  }

  return NextResponse.json({ success: true })
}
