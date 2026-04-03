import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { openai } from '@/lib/openai'
import { transcribeFromUrl } from '@/lib/deepgram'
import { getVideoUrl } from '@/lib/storage'

export const maxDuration = 120

export async function POST(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const video = await prisma.video.findFirst({
    where: { id: params.videoId, workspaceId: ws.workspaceId },
  })

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }

  try {
    // Step 1: Get the public URL for the video
    const videoUrl = video.storageKey.startsWith('http')
      ? video.storageKey
      : `${request.nextUrl.origin}${getVideoUrl(video.storageKey)}`

    console.log(`[analyze] Step 1: Transcribing via Deepgram URL: ${videoUrl.slice(0, 80)}...`)

    // Step 2: Transcribe with Deepgram (no file size limit — sends URL, not file)
    const { transcript, segments } = await transcribeFromUrl(videoUrl)
    console.log(`[analyze] Step 2 done: "${transcript.slice(0, 100)}..."`)

    // Step 3: Analyze with GPT to get name, summary, bullet points
    const analysis = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You analyze video transcripts for application flows. Given a transcript, generate:
1. A short descriptive name (3-6 words) for the video
2. A one-sentence summary
3. 3-5 bullet points of key topics covered

Respond in JSON format:
{
  "displayName": "...",
  "summary": "...",
  "bulletPoints": ["...", "..."]
}`,
        },
        {
          role: 'user',
          content: `Video filename: ${video.filename}\n\nTranscript:\n${transcript}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const analysisResult = JSON.parse(analysis.choices[0]?.message?.content || '{}')
    console.log(`[analyze] Step 3 done: "${analysisResult.displayName}"`)

    // Step 4: Save to database
    const updated = await prisma.video.update({
      where: { id: video.id },
      data: {
        transcript,
        segments: segments as any,
        displayName: analysisResult.displayName || null,
        summary: analysisResult.summary || null,
        bulletPoints: analysisResult.bulletPoints || [],
      },
    })

    return NextResponse.json({
      id: updated.id,
      transcript,
      segments,
      displayName: updated.displayName,
      summary: updated.summary,
      bulletPoints: updated.bulletPoints,
    })
  } catch (error: any) {
    const errMsg = error?.message || String(error)
    console.error('Video analysis error:', errMsg)
    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    )
  }
}
