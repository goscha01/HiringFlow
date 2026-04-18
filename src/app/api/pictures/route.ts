import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const pictures = await prisma.picture.findMany({
    where: { workspaceId: ws.workspaceId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(pictures)
}

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Not an image' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })

  let url: string
  let storageKey: string

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob')
    const blob = await put(`images/${Date.now()}-${file.name}`, file, {
      access: 'public',
      contentType: file.type,
    })
    url = blob.url
    storageKey = blob.url
  } else if (process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET) {
    const { getUploadPresignedUrl, getPublicUrl } = await import('@/lib/s3')
    storageKey = `images/${Date.now()}-${file.name}`
    const uploadUrl = await getUploadPresignedUrl(storageKey, file.type)
    const buffer = Buffer.from(await file.arrayBuffer())
    await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: buffer })
    url = getPublicUrl(storageKey)
  } else {
    const { writeFile, mkdir } = await import('fs/promises')
    const path = await import('path')
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'images')
    await mkdir(uploadDir, { recursive: true })
    const fname = `${Date.now()}-${file.name}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(uploadDir, fname), buffer)
    storageKey = fname
    url = `/uploads/images/${fname}`
  }

  const picture = await prisma.picture.create({
    data: {
      workspaceId: ws.workspaceId,
      createdById: ws.userId,
      filename: file.name,
      storageKey,
      url,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  })

  return NextResponse.json(picture)
}
