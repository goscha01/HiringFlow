/**
 * Pipeline scoping for AutomationRule matching.
 *
 * Every rule lookup that's about "what should fire for this candidate?" must
 * filter by the candidate's pipeline so a Cleaner rule doesn't fire against a
 * Dispatcher candidate. The match condition is:
 *
 *   rule.pipelineId === candidatePipelineId  OR  rule.pipelineId IS NULL
 *
 * Rules with `pipelineId IS NULL` are "any pipeline" — they apply
 * workspace-wide. This preserves back-compat for rules created before the
 * multi-pipeline refactor (their pipelineId starts as null).
 *
 * Callers pass the *session* (or a flowId + workspaceId pair) and we resolve
 * the candidate's pipeline once. The returned object is a Prisma `where`
 * fragment suitable for spreading inside an AutomationRule query.
 */

import { prisma } from './prisma'
import { resolvePipelineForFlow, resolvePipelineForSession } from './pipelines'

export interface PipelineScopeFragment {
  OR: Array<{ pipelineId: string } | { pipelineId: null }>
}

// Build a Prisma OR clause matching rules whose pipelineId is the candidate's
// pipeline OR null. Callers compose this inside an `AND` array alongside the
// other rule filters (workspaceId, triggerType, flow scope).
//
// Why a helper instead of a raw OR: callers tend to already have an AND list
// for flow/training scoping. Returning the OR fragment lets callers push it
// onto that list directly, keeping the resulting where clause flat.
export function pipelineScopeFragment(candidatePipelineId: string): PipelineScopeFragment {
  return {
    OR: [{ pipelineId: candidatePipelineId }, { pipelineId: null }],
  }
}

// Resolve "which pipeline does this session belong to?" for use in a
// downstream rule query. Returns the pipeline id (never null — the resolver
// always picks the workspace default if no explicit pipeline is set on the
// flow). On lookup failure (session missing) returns null and the caller
// should skip dispatch — there's nothing to match against.
export async function resolveCandidatePipelineId(sessionId: string): Promise<string | null> {
  const pipeline = await resolvePipelineForSession({ sessionId })
  return pipeline?.id ?? null
}

// Same as above, starting from a flow + workspace tuple. Useful when the
// caller already has those in hand (e.g. fireBackgroundCheckAutomations
// includes session.flow on its query).
export async function resolveFlowPipelineId(opts: {
  flowId: string
  workspaceId: string
}): Promise<string> {
  const pipeline = await resolvePipelineForFlow(opts)
  return pipeline.id
}

// Convenience: given a candidate's session id, return the AND fragments any
// rule matcher should include. Callers spread this into their existing AND
// list. The intent is "every rule dispatch site uses the same predicate" —
// don't reach for the underlying helpers directly unless you need a
// non-standard composition.
export async function automationScopeForSession(sessionId: string): Promise<{
  pipelineId: string
  whereFragment: PipelineScopeFragment
} | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { flowId: true, workspaceId: true },
  })
  if (!session) return null
  const pipelineId = await resolveFlowPipelineId({
    flowId: session.flowId,
    workspaceId: session.workspaceId,
  })
  return { pipelineId, whereFragment: pipelineScopeFragment(pipelineId) }
}
