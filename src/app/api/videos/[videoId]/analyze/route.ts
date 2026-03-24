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
    console.log(`[analyze] Step 1: Fetching video ${video.id}, storageKey starts with http: ${video.storageKey.startsWith('http')}`)
    let buffer: Buffer
    if (video.storageKey.startsWith('http')) {
      const res = await fetch(video.storageKey)
      if (!res.ok) throw new Error(`Failed to fetch video: ${res.status} ${res.statusText}`)
      buffer = Buffer.from(await res.arrayBuffer())
    } else {
      const filePath = path.join(UPLOAD_DIR, video.storageKey)
      buffer = await readFile(filePath)
    }
    console.log(`[analyze] Step 1 done: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`)

    // Step 2: Transcribe with Whisper
    // Whisper limit is 25MB. For large videos, we send the blob URL directly
    // and let the API handle partial reads if supported, or fail gracefully.
    const safeFilename = video.filename.replace(/\.mov$/i, '.mp4')
    const MAX_WHISPER_SIZE = 25 * 1024 * 1024

    if (buffer.length > MAX_WHISPER_SIZE) {
      console.log(`[analyze] Video ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds 25MB Whisper limit, using URL-based transcription`)
      // Use OpenAI's newer API that accepts URLs (if available), or return a helpful error
      // For now, we'll use the transcription with a note about partial coverage
      return NextResponse.json(
        { error: `Video is ${(buffer.length / 1024 / 1024).toFixed(1)}MB — exceeds Whisper's 25MB limit. Please upload a compressed or shorter video, or click "Generate Captions" to try manual transcription.` },
        { status: 413 }
      )
    }

    console.log(`[analyze] Step 2: Sending to Whisper as "${safeFilename}", ${(buffer.length / 1024 / 1024).toFixed(1)}MB`)
    const file = await toFile(buffer, safeFilename, { type: 'video/mp4' })
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    console.log(`[analyze] Step 2 done: transcription received`)
    const transcript = transcription.text
    console.log(`[analyze] Transcript: "${transcript.slice(0, 100)}..."`)
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
    const errMsg = error?.message || String(error)
    const errStatus = error?.status || error?.response?.status
    const errBody = error?.response?.data || error?.error || null
    console.error('Video analysis error:', JSON.stringify({ message: errMsg, status: errStatus, body: errBody, stack: error?.stack?.slice(0, 500) }))
    return NextResponse.json(
      { error: errMsg, details: errBody },
      { status: 500 }
    )
  }
}
