import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
  }

  try {
    // Try Vercel Blob first
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import('@vercel/blob')
      const blob = await put(`images/${Date.now()}-${file.name}`, file, {
        access: 'public',
        contentType: file.type,
      })
      return NextResponse.json({ url: blob.url })
    }

    // Fallback: S3
    if (process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET) {
      const { getUploadPresignedUrl, getPublicUrl } = await import('@/lib/s3')
      const key = `images/${Date.now()}-${file.name}`
      const uploadUrl = await getUploadPresignedUrl(key, file.type)

      // Upload to S3 server-side
      const buffer = Buffer.from(await file.arrayBuffer())
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: buffer,
      })

      return NextResponse.json({ url: getPublicUrl(key) })
    }

    // Fallback: local filesystem (dev)
    const { writeFile, mkdir } = await import('fs/promises')
    const path = await import('path')
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'images')
    await mkdir(uploadDir, { recursive: true })
    const filename = `${Date.now()}-${file.name}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(uploadDir, filename), buffer)
    return NextResponse.json({ url: `/uploads/images/${filename}` })
  } catch (error) {
    console.error('Image upload error:', error)
    return NextResponse.json({ error: `Upload failed: ${error instanceof Error ? error.message : 'unknown'}` }, { status: 500 })
  }
}
