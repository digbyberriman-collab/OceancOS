import { prisma } from "./db";

export async function recordAudit(opts: {
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | string | null;
}) {
  const detailsStr =
    opts.details == null
      ? null
      : typeof opts.details === "string"
        ? opts.details
        : JSON.stringify(opts.details);
  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId ?? null,
      action: opts.action,
      resource: opts.resource,
      resourceId: opts.resourceId ?? null,
      details: detailsStr,
    },
  });
}
