import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { markRead } from "@/lib/notifications";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { Bell, CheckCheck } from "lucide-react";

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

  const unreadCount = unreadIds.length;

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow="System"
        title="Notifications"
        subtitle="In-app inbox. Email fan-out enables when SMTP is configured."
        actions={
          <form action={markAllRead}>
            <button className="btn btn-ghost flex items-center gap-1.5">
              <CheckCheck size={14} />
              Mark all read
            </button>
          </form>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Bell size={20} />}
          title="Inbox zero"
          hint="You're up to date. Notifications for change orders, approvals and more will appear here."
        />
      ) : (
        <div className="surface overflow-hidden">
          {/* Inbox header */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line bg-ink-850/40">
            <Bell size={13} className="text-marine shrink-0" />
            <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
              {items.length} notification{items.length !== 1 ? "s" : ""}
            </span>
            {unreadCount > 0 && (
              <span className="badge badge-info ml-1">{unreadCount} new</span>
            )}
          </div>

          <div className="divide-y divide-line">
            {items.map((n) => {
              const href = n.resource && n.resourceId && RESOURCE_LINK[n.resource]
                ? `${RESOURCE_LINK[n.resource]}/${n.resourceId}`
                : null;
              const wasUnread = unreadIds.includes(n.id);
              const priorityTone =
                n.priority === "CRITICAL" ? "bad" :
                n.priority === "HIGH" ? "warn" :
                "info";

              const inner = (
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* Unread dot */}
                  <div className="shrink-0 w-2 mt-1.5">
                    {wasUnread && (
                      <span className="block w-1.5 h-1.5 rounded-full bg-accent-bright" />
                    )}
                  </div>

                  {/* Badge */}
                  <div className="shrink-0 pt-0.5">
                    <Badge tone={priorityTone}>
                      {n.kind.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm leading-snug ${wasUnread ? "text-white font-medium" : "text-muted"}`}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="text-xs text-muted mt-0.5 line-clamp-2 text-pretty">
                        {n.body}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-xs text-faint tnum whitespace-nowrap">
                    {fmtDateTime(n.createdAt)}
                  </div>
                </div>
              );

              return href ? (
                <Link
                  key={n.id}
                  href={href}
                  className="block hover:bg-ink-800/60 transition-colors duration-150"
                >
                  {inner}
                </Link>
              ) : (
                <div key={n.id} className={wasUnread ? "bg-accent/5" : ""}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
