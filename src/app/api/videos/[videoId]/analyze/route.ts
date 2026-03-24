import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { openai } from '@/lib/openai'
import { readFile } from 'fs/promises'
import path from 'path'
import { toFile } from 'openai'

export const maxDuration = 120

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

export async function POST(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const video = await prisma.video.findFirst({
    where: { id: params.videoId, ownerUserId: session.user.id },
  })

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }

  try {
    // Step 1: Get the video file
    let buffer: Buffer
    if (video.storageKey.startsWith('http')) {
      const res = await fetch(video.storageKey)
      if (!res.ok) throw new Error('Failed to fetch video from storage')
      buffer = Buffer.from(await res.arrayBuffer())
    } else {
      const filePath = path.join(UPLOAD_DIR, video.storageKey)
      buffer = await readFile(filePath)
    }

    // Step 2: Transcribe with Whisper
    const file = await toFile(buffer, video.filename, { type: video.mimeType })
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    const transcript = transcription.text
    const segments = (transcription as any).segments?.map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    })) || []

    // Step 3: Analyze with GPT to get name, summary, bullet points
    const analysis = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You analyze video interview transcripts. Given a transcript, generate:
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

    // Step 4: Save to database
    const updated = await prisma.video.update({
      where: { id: video.id },
      data: {
        transcript,
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
    console.error('Video analysis error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Analysis failed' },
      { status: 500 }
    )
  }
}
