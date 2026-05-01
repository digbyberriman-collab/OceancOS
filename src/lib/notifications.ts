import { prisma } from "./db";

export type NotifyKind =
  | "ASSIGNED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_OVERDUE"
  | "COMMENT"
  | "STATUS_CHANGE"
  | "BUDGET_EXCEEDED"
  | "SCHEDULE_DELAYED"
  | "DOC_EXPIRING"
  | "INVENTORY_LOW"
  | "CONTRACTOR_DOC_EXPIRED"
  | "CLASS_FLAG_DEADLINE"
  | "RISK_ESCALATED";

export async function notify(opts: {
  userIds: string[];
  kind: NotifyKind;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  body?: string;
  resource?: string;
  resourceId?: string;
}) {
  if (!opts.userIds.length) return;
  await prisma.notification.createMany({
    data: opts.userIds.map((userId) => ({
      userId,
      kind: opts.kind,
      priority: opts.priority ?? "MEDIUM",
      title: opts.title,
      body: opts.body ?? null,
      resource: opts.resource ?? null,
      resourceId: opts.resourceId ?? null,
    })),
  });
  // Email fan-out is deliberately a no-op until SMTP is configured. See lib/notifications/email.ts.
  if (process.env.SMTP_HOST) {
    // dynamic import to avoid bundling nodemailer until configured
    try {
      const { sendEmailBatch } = await import("./email");
      await sendEmailBatch(opts);
    } catch {
      // fail silent — in-app notifications are the source of truth
    }
  }
}

export async function markRead(userId: string, ids: string[]) {
  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId },
    data: { readAt: new Date() },
  });
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
