import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceSession, unauthorized } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { openai } from '@/lib/openai'
import { resolvePipelineForFlow, stagesFor } from '@/lib/pipelines'
import { resolveStage } from '@/lib/funnel-stages'

// AI-generates a kind, professional rejection email tailored to:
//   - the candidate's current pipeline stage (so a Stage-1 reject reads
//     differently from a post-interview reject),
//   - the recruiter-entered rejection reason (free-form or preset),
//   - the workspace's sender name (so the sign-off matches).
//
// Returns subject + bodyHtml. Body uses the same {{candidate_name}} /
// {{flow_name}} merge tokens as the rest of the email system so the same
// row can be saved as a reusable EmailTemplate.

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ws = await getWorkspaceSession()
  if (!ws) return unauthorized()

  const session = await prisma.session.findFirst({
    where: { id: params.id, workspaceId: ws.workspaceId },
    include: {
      flow: { select: { id: true, name: true } },
      workspace: { select: { name: true, senderName: true } },
    },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const reasonOverride = typeof body?.reason === 'string' ? body.reason.trim() : ''
  const reason = reasonOverride || session.rejectionReason?.trim() || ''
  if (!reason) {
    return NextResponse.json({ error: 'No rejection reason set — add one before generating the email.' }, { status: 400 })
  }

  let stageLabel = ''
  if (session.flowId) {
    const pipeline = await resolvePipelineForFlow({ flowId: session.flowId, workspaceId: ws.workspaceId })
    const stage = resolveStage(session.pipelineStatus, stagesFor(pipeline))
    stageLabel = stage?.label || ''
  }

  const candidateName = session.candidateName || 'the candidate'
  const flowName = session.flow?.name || 'the role'
  const senderName = session.workspace?.senderName || session.workspace?.name || 'The Hiring Team'

  const prompt = `You write hiring rejection emails on behalf of a recruiter. Generate ONE email for the candidate below.

Candidate name: ${candidateName}
Role / Flow: ${flowName}
Current pipeline stage: ${stageLabel || 'unknown'}
Rejection reason (private — DO NOT quote verbatim): ${reason}
Sender (sign-off as): ${senderName}

Tone & rules:
- Warm, respectful, concise (3–5 short paragraphs MAX).
- Use the rejection reason to PERSONALIZE the message, but rephrase it tactfully — never copy the recruiter's wording.
- If the reason names a hard requirement (language, location, schedule, pay), acknowledge the mismatch directly but kindly.
- If the reason is subjective ("not qualified", "not selected"), keep it generic without faulting the candidate.
- Match the stage: early-stage rejections are brief; late-stage (post-interview) rejections thank them for their time investment.
- Sign off with the sender name. No fake company-wide signatures.
- Use the merge token {{candidate_name}} in the greeting and {{flow_name}} when referring to the role. Do NOT insert other merge tokens.
- Output clean HTML with <p> paragraphs only. No <html>/<body> wrappers, no inline styles, no headers, no images, no links.

Respond in strict JSON (no markdown, no commentary):
{
  "subject": "Short, neutral subject line — no emoji",
  "bodyHtml": "<p>...</p><p>...</p>"
}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content?.trim() || ''
    let parsed: { subject?: unknown; bodyHtml?: unknown }
    try {
      parsed = JSON.parse(content)
    } catch {
      return NextResponse.json({ error: 'AI returned malformed JSON' }, { status: 502 })
    }
    const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : ''
    const bodyHtml = typeof parsed.bodyHtml === 'string' ? parsed.bodyHtml.trim() : ''
    if (!subject || !bodyHtml) {
      return NextResponse.json({ error: 'AI response missing subject or body' }, { status: 502 })
    }

    return NextResponse.json({ subject, bodyHtml, stage: stageLabel, reason })
  } catch (err: any) {
    console.error('[generate-rejection-email] error:', err)
    return NextResponse.json({ error: err?.message || 'AI generation failed' }, { status: 500 })
  }
}
