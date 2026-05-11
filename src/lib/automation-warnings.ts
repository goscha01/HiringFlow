/**
 * Soft "are you sure?" guard surfaced in the automation editor's save flow.
 *
 * Targets a class of recruiter mistakes where the trigger and the message
 * body disagree about what event just happened — typically because the
 * recruiter cloned an old rule, edited the body, but left the trigger
 * pointing at the wrong lifecycle event. The Test George incident
 * (2026-05-11) is the seed case: a `before_meeting` reminder whose SMS
 * body told the candidate the meeting had been rescheduled, so every
 * candidate received a "rescheduled" SMS 5 min before every interview.
 *
 * These warnings are advisory, not blocking. The editor renders them
 * inline and the user can choose Save anyway — there are legitimate
 * cases the heuristics will false-positive on (e.g. a `before_meeting`
 * rule whose body discusses an earlier reschedule by design).
 *
 * Pattern matching is purely lexical against the SMS body and email
 * template subject. We don't fetch email template bodies here because
 * the editor doesn't have them on the client; covering subjects catches
 * the most common slip (cloned rules keep the old subject line).
 */

export type WarnableTriggerType =
  | 'meeting_scheduled'
  | 'meeting_rescheduled'
  | 'before_meeting'
  | 'meeting_started'
  | 'meeting_ended'
  | 'meeting_no_show'
  | 'recording_ready'
  | 'transcript_ready'
  | string

export interface WarnableStep {
  channel?: string | null
  smsBody?: string | null
  emailTemplate?: { subject?: string | null } | null
}

export interface WarnableRule {
  triggerType: WarnableTriggerType
  steps: WarnableStep[]
}

interface Pattern {
  // Regex applied to lowercased body/subject text. Case-insensitive by
  // virtue of pre-lowercasing — keep these literal without /i.
  test: RegExp
  // Trigger types where the phrase is on-topic. If the rule's trigger
  // isn't in this set, we surface a warning.
  expectedTriggers: WarnableTriggerType[]
  // Short label used in the warning text. "rescheduling" → "Body refers to rescheduling…"
  topic: string
  // Concrete trigger the recruiter probably meant. Surfaced in the
  // suggestion so the warning is actionable.
  suggestedTrigger: WarnableTriggerType
}

const PATTERNS: Pattern[] = [
  // Rescheduling language → only sensible on meeting_rescheduled
  {
    test: /\breschedul/,
    expectedTriggers: ['meeting_rescheduled'],
    topic: 'rescheduling',
    suggestedTrigger: 'meeting_rescheduled',
  },
  {
    test: /\bmoved to\b/,
    expectedTriggers: ['meeting_rescheduled'],
    topic: 'a meeting being moved',
    suggestedTrigger: 'meeting_rescheduled',
  },
  {
    test: /\bnew (time|link|meeting link|meet link)\b/,
    expectedTriggers: ['meeting_rescheduled'],
    topic: 'a new time / link',
    suggestedTrigger: 'meeting_rescheduled',
  },

  // Post-meeting follow-up language → only sensible on meeting_ended /
  // recording_ready / transcript_ready (the recording-ready handoff is
  // a common follow-up "your recording is ready" use case).
  {
    test: /\bthanks for (the )?(interview|meeting|call|joining|attending|chat)/,
    expectedTriggers: ['meeting_ended', 'recording_ready', 'transcript_ready'],
    topic: 'thanking the candidate after the meeting',
    suggestedTrigger: 'meeting_ended',
  },
  {
    test: /\bafter our (interview|meeting|call|chat)\b/,
    expectedTriggers: ['meeting_ended', 'recording_ready', 'transcript_ready'],
    topic: 'a follow-up after the meeting',
    suggestedTrigger: 'meeting_ended',
  },
  {
    test: /\b(great|nice) (speaking|talking|chatting)\b/,
    expectedTriggers: ['meeting_ended', 'recording_ready', 'transcript_ready'],
    topic: 'a post-meeting follow-up',
    suggestedTrigger: 'meeting_ended',
  },

  // No-show language → only sensible on meeting_no_show
  {
    test: /\b(missed (your|the) (interview|meeting|call))\b/,
    expectedTriggers: ['meeting_no_show'],
    topic: 'a missed meeting',
    suggestedTrigger: 'meeting_no_show',
  },
  {
    test: /\bno[- ]show\b/,
    expectedTriggers: ['meeting_no_show'],
    topic: 'a no-show',
    suggestedTrigger: 'meeting_no_show',
  },
  {
    test: /\b(didn'?t make it|couldn'?t make it|weren'?t able to join|we missed you)\b/,
    expectedTriggers: ['meeting_no_show'],
    topic: 'the candidate not showing up',
    suggestedTrigger: 'meeting_no_show',
  },
]

function collectText(rule: WarnableRule): string {
  const parts: string[] = []
  for (const step of rule.steps) {
    if (step.smsBody) parts.push(step.smsBody)
    if (step.emailTemplate?.subject) parts.push(step.emailTemplate.subject)
  }
  return parts.join('\n').toLowerCase()
}

export function detectAutomationWarnings(rule: WarnableRule): string[] {
  const text = collectText(rule)
  if (!text.trim()) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of PATTERNS) {
    if (!p.test.test(text)) continue
    if (p.expectedTriggers.includes(rule.triggerType)) continue
    // Dedupe by topic — a body that mentions "rescheduled" three times
    // shouldn't produce three identical warnings.
    if (seen.has(p.topic)) continue
    seen.add(p.topic)
    out.push(
      `This message mentions ${p.topic}, but the trigger is "${rule.triggerType}". ` +
      `The Meet Tracker extension fires "${p.suggestedTrigger}" when this actually happens — ` +
      `using a different trigger will send this message at the wrong time.`,
    )
  }
  return out
}
