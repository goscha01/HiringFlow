import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'

// Generate a scoped client token for direct browser-to-blob upload
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { filename } = await request.json()

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Blob storage not configured' }, { status: 500 })
  }

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname: filename || 'video.mp4',
      allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'],
      maximumSizeInBytes: 500 * 1024 * 1024,
    })

    return NextResponse.json({ clientToken })
  } catch (error) {
    console.error('Token generation error:', error)
    return NextResponse.json({ error: 'Failed to generate upload token' }, { status: 500 })
  }
}
