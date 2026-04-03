import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { getUploadPresignedUrl, getPublicUrl } from '@/lib/s3'

// Returns a presigned S3 URL for direct browser-to-S3 upload
// No file data goes through our server — only a tiny JSON request
export async function POST(request: NextRequest) {
  try {
    const ws = await getWorkspaceSession()
    if (!ws) return unauthorized()

    const { filename, contentType } = await request.json()

    console.log('[upload-url] Generating presigned URL for:', filename)
    console.log('[upload-url] S3_BUCKET:', process.env.S3_BUCKET || 'NOT SET')
    console.log('[upload-url] S3_REGION:', process.env.S3_REGION || 'NOT SET')
    console.log('[upload-url] AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'NOT SET')

    const key = `videos/${Date.now()}-${filename || 'video.mp4'}`
    const uploadUrl = await getUploadPresignedUrl(key, contentType || 'video/mp4')
    const publicUrl = getPublicUrl(key)

    console.log('[upload-url] Success, key:', key)
    return NextResponse.json({ uploadUrl, publicUrl, key })
  } catch (error) {
    console.error('[upload-url] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message, details: String(error) }, { status: 500 })
  }
}
