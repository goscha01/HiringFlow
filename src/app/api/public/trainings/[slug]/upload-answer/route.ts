import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateAccessToken } from '@/lib/training-access'
import { getWorkspaceSession } from '@/lib/auth'

// Public endpoint candidates use to upload a file as their answer to a
// `file`-type quiz question. We verify the candidate has access to this
// training (token, public, or preview-as-owner), store the file, and return
// { url, mimeType, sizeBytes }. The viewer puts that object into the quiz
// `answers` payload; the grader at /api/public/trainings/[slug] validates the
// upload against the question's acceptedMimeTypes / maxSizeMb.
const HARD_MAX_BYTES = 50 * 1024 * 1024 // 50 MB cap regardless of per-question limit

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const training = await prisma.training.findUnique({ where: { slug: params.slug } })
  if (!training) return NextResponse.json({ error: 'Training not found' }, { status: 404 })

  // Authorize: published + (token if invitation_only), OR owner preview.
  const isPreview = request.nextUrl.searchParams.get('preview') === '1'
  if (isPreview) {
    const ws = await getWorkspaceSession()
    if (!ws || (!ws.isSuperAdmin && ws.workspaceId !== training.workspaceId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    if (!training.isPublished) return NextResponse.json({ error: 'Training not found' }, { status: 404 })
    if (training.accessMode === 'invitation_only') {
      const token = request.nextUrl.searchParams.get('token')
      if (!token || !(await validateAccessToken(token, training.id))) {
        return NextResponse.json({ error: 'Access required', code: 'TOKEN_REQUIRED' }, { status: 403 })
      }
    }
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (file.size > HARD_MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${HARD_MAX_BYTES / 1024 / 1024}MB)` }, { status: 400 })
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `quiz-answers/${training.id}/${Date.now()}-${safeName}`

  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import('@vercel/blob')
      const blob = await put(key, file, { access: 'public', contentType: file.type })
      return NextResponse.json({ url: blob.url, mimeType: file.type, sizeBytes: file.size })
    }

    if (process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET) {
      const { getUploadPresignedUrl, getPublicUrl } = await import('@/lib/s3')
      const uploadUrl = await getUploadPresignedUrl(key, file.type)
      const buffer = Buffer.from(await file.arrayBuffer())
      await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: buffer })
      return NextResponse.json({ url: getPublicUrl(key), mimeType: file.type, sizeBytes: file.size })
    }

    const { writeFile, mkdir } = await import('fs/promises')
    const path = await import('path')
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'quiz-answers')
    await mkdir(uploadDir, { recursive: true })
    const filename = `${Date.now()}-${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(uploadDir, filename), buffer)
    return NextResponse.json({ url: `/uploads/quiz-answers/${filename}`, mimeType: file.type, sizeBytes: file.size })
  } catch (err) {
    console.error('[Quiz answer upload] failed:', err)
    return NextResponse.json({ error: `Upload failed: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 })
  }
}
