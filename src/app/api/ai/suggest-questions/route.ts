import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { openai } from '@/lib/openai'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { transcript, stepTitle, flowContext } = await request.json()

    const prompt = `You are helping build a video-based hiring flow. Based on the following context, suggest a question and answer options that a candidate should respond to after watching the video.

${stepTitle ? `Step title: "${stepTitle}"` : ''}
${flowContext ? `Flow context: ${flowContext}` : ''}
${transcript ? `Video transcript: "${transcript}"` : 'No transcript available.'}

Respond in JSON format:
{
  "question": "The question to ask the candidate",
  "options": [
    { "text": "Option 1 text", "isEndFlow": false },
    { "text": "Option 2 text", "isEndFlow": false },
    { "text": "Option 3 text", "isEndFlow": true }
  ]
}

Guidelines:
- The question should be relevant to the video content or hiring context
- Provide 2-4 answer options
- Options should represent meaningful candidate choices that could branch the flow
- Mark options that should end the flow with "isEndFlow": true
- Keep options concise (under 50 characters)
- Return only valid JSON, no markdown`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    })

    const content = completion.choices[0]?.message?.content?.trim() || ''

    // Parse JSON from response (handle potential markdown wrapping)
    let parsed
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    return NextResponse.json(parsed)
  } catch (error: any) {
    console.error('Question suggestion error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate suggestions' },
      { status: 500 }
    )
  }
}
