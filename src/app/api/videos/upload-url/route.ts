import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

// Handle both the token generation and upload completion callbacks
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Authenticate the user
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
          throw new Error('Unauthorized')
        }

        return {
          allowedContentTypes: [
            'video/mp4', 'video/quicktime', 'video/webm',
            'video/x-msvideo', 'video/x-matroska', 'video/mov',
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Optional: could register video here, but we do it in the client
        // after upload completes for better UX control
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
