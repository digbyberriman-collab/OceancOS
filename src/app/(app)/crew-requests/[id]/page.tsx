import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { Field, Select, Textarea } from "@/components/ui/Form";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/utils";
import { SectionCard } from "@/components/workflow/SectionCard";
import { DefGrid, DefRow } from "@/components/workflow/DefinitionGrid";
import { transitionCrewRequest, assignCrewRequest, addCrewRequestComment } from "../actions";
import { ArrowLeft, MessageSquare, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CrewRequestDetail({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CR_VIEW)) return notFound();

  const cr = await prisma.crewRequest.findUnique({
    where: { id: params.id },
    include: {
      project: { include: { vessel: true } },
      comments: { orderBy: { createdAt: "asc" } },
      linkedChangeOrder: true,
    },
  });
  if (!cr) return notFound();

  const users = await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const transitions: Record<string, { to: string; label: string; tone?: "danger" }[]> = {
    NEW: [{ to: "TRIAGED", label: "Triage" }, { to: "ASSIGNED", label: "Mark Assigned" }, { to: "REJECTED", label: "Reject", tone: "danger" }],
    TRIAGED: [{ to: "ASSIGNED", label: "Mark Assigned" }, { to: "REJECTED", label: "Reject", tone: "danger" }],
    ASSIGNED: [{ to: "IN_PROGRESS", label: "Start Work" }, { to: "BLOCKED", label: "Mark Blocked" }, { to: "AWAITING_APPROVAL", label: "Await Approval" }, { to: "COMPLETED", label: "Complete" }],
    IN_PROGRESS: [{ to: "BLOCKED", label: "Mark Blocked" }, { to: "AWAITING_APPROVAL", label: "Await Approval" }, { to: "COMPLETED", label: "Complete" }],
    BLOCKED: [{ to: "IN_PROGRESS", label: "Resume Work" }, { to: "REJECTED", label: "Reject", tone: "danger" }],
    AWAITING_APPROVAL: [{ to: "IN_PROGRESS", label: "Back to Work" }, { to: "COMPLETED", label: "Complete" }, { to: "REJECTED", label: "Reject", tone: "danger" }],
    COMPLETED: [{ to: "CLOSED", label: "Close" }],
    REJECTED: [{ to: "NEW", label: "Reopen" }],
    CLOSED: [],
  };

  const now = new Date();
  const isOverdue =
    cr.dueDate &&
    cr.dueDate < now &&
    !["COMPLETED", "CLOSED", "REJECTED"].includes(cr.status);

  return (
    <div className="animate-fade-up">
      {/* ── Breadcrumb & header ── */}
      <div className="mb-6">
        <Link
          href="/crew-requests"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          Crew Requests
        </Link>
        <PageHeader
          title={`${cr.number} — ${cr.title}`}
          subtitle={`${cr.project.vessel.name} · ${cr.project.name}`}
          actions={
            <>
              <PriorityBadge value={cr.priority} />
              <StatusBadge value={cr.status} />
            </>
          }
        />
        {isOverdue && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-bad/10 border border-bad/30 rounded-lg text-sm text-bad max-w-fit">
            <AlertTriangle size={14} />
            <span className="font-medium">Overdue</span>
            <span className="text-bad/70">— was due {fmtDate(cr.dueDate)}</span>
          </div>
        )}
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Request Details">
            <DefGrid>
              <DefRow label="Description" span2>
                <span className="whitespace-pre-wrap">{cr.description}</span>
              </DefRow>
              <DefRow label="Category">
                <span className="badge badge-muted">{cr.category.replace(/_/g, " ")}</span>
              </DefRow>
              <DefRow label="Department">{cr.departmentCode ?? "—"}</DefRow>
              <DefRow label="Requested By">{userMap.get(cr.requestedById) ?? "—"}</DefRow>
              <DefRow label="Assigned To">
                {cr.assignedToId ? (
                  <span className="font-medium">{userMap.get(cr.assignedToId)}</span>
                ) : (
                  <span className="text-muted">Unassigned</span>
                )}
              </DefRow>
              <DefRow label="Due Date">
                <span className={`tnum ${isOverdue ? "text-bad font-medium" : ""}`}>
                  {fmtDate(cr.dueDate)}
                </span>
              </DefRow>
              <DefRow label="Cost Impact">
                <span className="tnum font-medium">{fmtMoney(cr.costImpact)}</span>
              </DefRow>
              <DefRow label="Schedule Impact">
                {cr.scheduleImpactDays ? (
                  <span className="tnum font-medium text-warn">+{cr.scheduleImpactDays} days</span>
                ) : (
                  <span className="text-muted">No impact</span>
                )}
              </DefRow>
              {cr.safetyImpact && (
                <DefRow label="Safety Impact" span2>
                  <span className="whitespace-pre-wrap">{cr.safetyImpact}</span>
                </DefRow>
              )}
              {cr.linkedChangeOrder && (
                <DefRow label="Linked Change Order">
                  <Link
                    href={`/change-orders/${cr.linkedChangeOrder.id}`}
                    className="text-accent hover:text-accent-bright transition-colors font-mono text-xs"
                  >
                    {cr.linkedChangeOrder.number}
                  </Link>
                </DefRow>
              )}
            </DefGrid>
          </SectionCard>

          {/* Workflow actions */}
          {(transitions[cr.status] ?? []).length > 0 && (
            <SectionCard title="Workflow Actions">
              <div className="flex flex-wrap gap-2">
                {(transitions[cr.status] ?? []).map((t) => (
                  <form key={t.to} action={async () => { "use server"; await transitionCrewRequest(cr.id, t.to); }}>
                    <button className={t.tone === "danger" ? "btn-danger" : "btn-primary"}>
                      {t.label}
                    </button>
                  </form>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Assignment sidebar */}
        <SectionCard title="Assignment">
          {hasPermission(user, PERMISSIONS.CR_ASSIGN) ? (
            <form action={assignCrewRequest} className="space-y-3">
              <input type="hidden" name="id" value={cr.id} />
              <Field label="Assign To">
                <Select name="assignedToId" defaultValue={cr.assignedToId ?? ""}>
                  <option value="">— Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </Field>
              <button className="btn-primary w-full">Save Assignment</button>
            </form>
          ) : (
            <p className="text-sm text-muted">
              {cr.assignedToId ? userMap.get(cr.assignedToId) : "Unassigned"}
            </p>
          )}
        </SectionCard>
      </div>

      {/* ── Comments ── */}
      <SectionCard
        title="Comments"
        className="mb-4"
        headerRight={
          cr.comments.length > 0 ? (
            <span className="badge badge-muted tnum">{cr.comments.length}</span>
          ) : undefined
        }
      >
        <div className="space-y-3 mb-5 max-h-72 overflow-y-auto">
          {cr.comments.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted py-2">
              <MessageSquare size={14} />
              No comments yet.
            </div>
          )}
          {cr.comments.map((c) => (
            <div key={c.id} className="text-sm bg-ink-850/40 rounded-lg px-3 py-2.5 border border-line-soft">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-white text-xs">
                  {userMap.get(c.authorId) ?? "—"}
                </span>
                <span className="text-xs text-muted tnum">{fmtDateTime(c.createdAt)}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{c.body}</div>
            </div>
          ))}
        </div>
        <form action={addCrewRequestComment} className="space-y-2 max-w-2xl">
          <input type="hidden" name="id" value={cr.id} />
          <Field label="Add a comment">
            <Textarea name="body" required placeholder="Write a comment…" />
          </Field>
          <button className="btn-primary">Post Comment</button>
        </form>
      </SectionCard>

      {/* ── Footer nav ── */}
      <div className="mt-2 flex justify-between items-center">
        <Link href="/crew-requests" className="btn-ghost">
          <ArrowLeft size={14} />
          Back to Crew Requests
        </Link>
      </div>
    </div>
  );
}
