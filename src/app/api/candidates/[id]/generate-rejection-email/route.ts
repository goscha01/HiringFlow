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
REJECTION REASON (must be reflected in the email): ${reason}
Sender (sign-off as): ${senderName}

REQUIRED — the body MUST explain WHY they are not moving forward, and that explanation MUST be derived from the REJECTION REASON above. Do not write a generic "we went with other candidates" email. The candidate should finish reading and understand the specific reason.

How to translate the reason into copy:
- Hard requirement mismatch (e.g. "No speaking Russian", "outside service area", "wrong schedule", "pay expectations"): state the specific requirement in plain English, e.g. "This role requires fluent Russian, and from your interview that didn't come through clearly." Be direct but kind — name the actual gap.
- Skill / qualification ("not qualified"): say what was lacking in general terms ("the experience level we needed for this role").
- Behavior / culture ("declined offer", "no-show"): reference the event factually without judgment.
- Truly subjective ("not selected"): say "we moved forward with candidates whose background was a closer match" — only fall back to generic phrasing when the reason itself is generic.

You may paraphrase the recruiter's wording for tone, but the substance of the reason must come through clearly. Do not omit it.

Other rules:
- Warm, respectful, concise (3–5 short paragraphs MAX).
- Match the stage: early-stage rejections are brief; late-stage (post-interview) rejections thank them for their time investment first.
- Sign off with the sender name. No fake company-wide signatures, no "Best regards, The Hiring Team" unless the sender is literally that.
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
      temperature: 0.4,
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
