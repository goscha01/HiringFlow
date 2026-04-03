import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

// Use edge runtime to bypass the 4.5MB body size limit
export const runtime = 'edge'

export async function POST(request: NextRequest) {
  // Check auth via cookie (edge runtime can't use getWorkspaceSession)
  const sessionRes = await fetch(new URL('/api/auth/session', request.url), {
    headers: { cookie: request.headers.get('cookie') || '' },
  })
  const session = await sessionRes.json()

  if (!session?.user?.id || !session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const filename = request.headers.get('x-filename') || 'video.mp4'
  const contentType = request.headers.get('x-content-type') || 'video/mp4'

  if (!request.body) {
    return NextResponse.json({ error: 'No body' }, { status: 400 })
  }

  try {
    const blob = await put(filename, request.body, {
      access: 'public',
      contentType,
    })

    // Register in DB via internal API (edge can't use Prisma directly)
    const regRes = await fetch(new URL('/api/videos/register', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        url: blob.url,
        filename,
        mimeType: contentType,
        sizeBytes: 0,
      }),
    })

    if (!regRes.ok) {
      return NextResponse.json({ error: 'Failed to register' }, { status: 500 })
    }

    const video = await regRes.json()
    return NextResponse.json(video)
  } catch (error) {
    console.error('Blob upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
