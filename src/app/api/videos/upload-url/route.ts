import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { put } from '@vercel/blob'

// Server-side upload: receive file via streaming, PUT to blob
// Uses Edge runtime to bypass 4.5MB body limit
export const runtime = 'edge'

export async function POST(request: NextRequest) {
  // Auth check via cookie (edge runtime can't use getServerSession)
  const cookie = request.cookies.get('next-auth.session-token')?.value
    || request.cookies.get('__Secure-next-auth.session-token')?.value
  if (!cookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const filename = request.headers.get('x-filename') || 'video.mp4'
  const contentType = request.headers.get('content-type') || 'video/mp4'

  if (!request.body) {
    return NextResponse.json({ error: 'No body' }, { status: 400 })
  }

  try {
    const blob = await put(`videos/${Date.now()}-${filename}`, request.body, {
      access: 'public',
      contentType,
    })

    return NextResponse.json({ url: blob.url, pathname: blob.pathname })
  } catch (error) {
    console.error('Blob upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
