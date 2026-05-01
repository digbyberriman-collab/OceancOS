import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { markRead } from "@/lib/notifications";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function markAllRead() {
  "use server";
  const user = await requireUser();
  const ids = (await prisma.notification.findMany({ where: { userId: user.id, readAt: null }, select: { id: true } })).map((n) => n.id);
  if (ids.length) await markRead(user.id, ids);
  revalidatePath("/notifications");
}

const RESOURCE_LINK: Record<string, string> = {
  ChangeOrder: "/change-orders",
  CrewRequest: "/crew-requests",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const unreadIds = items.filter((i) => !i.readAt).map((i) => i.id);
  if (unreadIds.length) await markRead(user.id, unreadIds);

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="In-app inbox. Email fan-out enables when SMTP is configured."
        actions={
          <form action={markAllRead}>
            <button className="btn">Mark all read</button>
          </form>
        }
      />
      {items.length === 0 ? (
        <EmptyState title="Inbox zero" hint="You're up to date." />
      ) : (
        <div className="surface divide-y divide-line">
          {items.map((n) => {
            const href = n.resource && n.resourceId && RESOURCE_LINK[n.resource]
              ? `${RESOURCE_LINK[n.resource]}/${n.resourceId}`
              : null;
            const inner = (
              <div className="flex items-start gap-3">
                <Badge tone={n.priority === "CRITICAL" ? "bad" : n.priority === "HIGH" ? "warn" : "info"}>
                  {n.kind.replace(/_/g, " ")}
                </Badge>
                <div className="flex-1">
                  <div className="text-sm">{n.title}</div>
                  {n.body && <div className="text-xs text-muted mt-0.5">{n.body}</div>}
                </div>
                <div className="text-xs text-muted whitespace-nowrap">{fmtDateTime(n.createdAt)}</div>
              </div>
            );
            return href ? (
              <Link key={n.id} href={href} className="block p-3 hover:bg-ink-800">{inner}</Link>
            ) : (
              <div key={n.id} className="p-3">{inner}</div>
            );
          })}
        </div>
      )}
    </>
  );
}
