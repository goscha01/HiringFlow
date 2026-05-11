/**
 * Shared session WHERE-clause helpers.
 *
 * Sessions created by `/api/automations/[id]/test` carry `source='test'`.
 * They're throwaway data that nonetheless live in the same `sessions` table
 * as real candidates — kanban, analytics, backfill, and stage-detection
 * crons should treat them as if they didn't exist by default. This module
 * centralises the WHERE fragment so callers don't re-derive it inline.
 *
 * Use:
 *   prisma.session.findMany({ where: { ...excludeTestSessions(), workspaceId } })
 *   prisma.session.count({ where: { ...excludeTestSessions(), status: 'lost' } })
 *
 * Important: Prisma's `{ source: { not: 'test' } }` does NOT match rows where
 * `source` is null (SQL three-valued logic — `NULL != 'test'` evaluates to
 * NULL, which is falsy in WHERE). Most real sessions have `source=null`, so
 * we need an explicit OR to cover them.
 */
export function excludeTestSessions() {
  return {
    OR: [
      { source: null },
      { source: { not: 'test' } },
    ],
  }
}
