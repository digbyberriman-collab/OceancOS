import { prisma } from "./db";

/**
 * Single entry point for auditing.
 *
 * `details` is stored as real JSON on Postgres, so an audit trail can be
 * queried by its contents rather than only read. A plain string is still
 * accepted and wrapped, so older call sites keep working.
 */
export async function recordAudit(opts: {
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | string | null;
}) {
  const details =
    opts.details == null
      ? undefined
      : typeof opts.details === "string"
        ? { note: opts.details }
        : opts.details;

  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId ?? null,
      action: opts.action,
      resource: opts.resource,
      resourceId: opts.resourceId ?? null,
      ...(details ? { details: details as object } : {}),
    },
  });
}
