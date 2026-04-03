import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import OpenAI from 'openai'

const openai = new OpenAI()

export async function POST(request: NextRequest) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  try {
    const { transcript, summary, bulletPoints } = await request.json()

    if (!transcript && !summary) {
      return NextResponse.json({ error: 'No content to generate title from' }, { status: 400 })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You generate short, descriptive titles (3-8 words) for application flow steps. The title should summarize the content like a section heading — professional and clear. Do NOT phrase it as a question. Examples: "Role Expectations Overview", "Company Culture & Values", "Requirements Discussion", "Team Introduction & Workflow". Respond with ONLY the title text, nothing else.',
        },
        {
          role: 'user',
          content: [
            summary && `Summary: ${summary}`,
            bulletPoints && `Key points: ${bulletPoints}`,
            transcript && `Transcript: ${transcript.slice(0, 500)}`,
          ].filter(Boolean).join('\n'),
        },
      ],
      max_tokens: 30,
      temperature: 0.7,
    })

    const title = completion.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') || ''

    return NextResponse.json({ title })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
