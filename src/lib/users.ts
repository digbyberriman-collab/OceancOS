import { prisma } from "./db";

/**
 * Resolve a set of user ids to display names, for pages that show "by
 * <name>" against comments, history entries or approval decisions.
 *
 * Was hand-rolled independently on four pages (ACTION_PLAN.md G6.7) — three
 * genuine duplicates of this exact query, consolidated here. The fourth,
 * crew-requests/[id]/page.tsx, is deliberately not one of them: it loads
 * every active user because it doubles as the assignee picker's option
 * list, not just the ids this page happens to render.
 *
 * Filters out nulls/undefined and de-duplicates before querying, so a
 * caller can pass raw, possibly-empty foreign-key columns straight through.
 */
export async function resolveUserNames(
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => !!id)));
  if (!uniqueIds.length) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}
