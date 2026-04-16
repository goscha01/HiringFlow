/**
 * Central flag + kill-switch for the Meet integration v2 service.
 *
 * - MEET_INTEGRATION_KILLSWITCH=1 globally disables every new entry point
 *   without requiring a code change. This is the last-resort rollback lever.
 * - Per-workspace gating is driven by Workspace.meetIntegrationV2Enabled.
 *
 * Usage: every new API route, cron, webhook, and UI surface calls
 * `meetIntegrationEnabled(workspaceId)` before doing Meet-specific work.
 */

import { prisma } from '../prisma'

export function globalKillswitchActive(): boolean {
  return process.env.MEET_INTEGRATION_KILLSWITCH === '1'
}

export async function meetIntegrationEnabled(workspaceId: string): Promise<boolean> {
  if (globalKillswitchActive()) return false
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { meetIntegrationV2Enabled: true },
  })
  return !!ws?.meetIntegrationV2Enabled
}
