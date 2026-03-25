import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUploadPresignedUrl, getPublicUrl } from '@/lib/s3'

// Returns a presigned S3 URL for direct browser-to-S3 upload
// No file data goes through our server — only a tiny JSON request
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { filename, contentType } = await request.json()

  const key = `videos/${Date.now()}-${filename || 'video.mp4'}`
  const uploadUrl = await getUploadPresignedUrl(key, contentType || 'video/mp4')
  const publicUrl = getPublicUrl(key)

  return NextResponse.json({ uploadUrl, publicUrl, key })
}
