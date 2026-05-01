import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { Field, Select, Textarea } from "@/components/ui/Form";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/utils";
import { transitionCrewRequest, assignCrewRequest, addCrewRequestComment } from "../actions";

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
    NEW: [{ to: "TRIAGED", label: "Triage" }, { to: "ASSIGNED", label: "Mark assigned" }, { to: "REJECTED", label: "Reject", tone: "danger" }],
    TRIAGED: [{ to: "ASSIGNED", label: "Mark assigned" }, { to: "REJECTED", label: "Reject", tone: "danger" }],
    ASSIGNED: [{ to: "IN_PROGRESS", label: "Start work" }, { to: "BLOCKED", label: "Block" }, { to: "AWAITING_APPROVAL", label: "Await approval" }, { to: "COMPLETED", label: "Complete" }],
    IN_PROGRESS: [{ to: "BLOCKED", label: "Block" }, { to: "AWAITING_APPROVAL", label: "Await approval" }, { to: "COMPLETED", label: "Complete" }],
    BLOCKED: [{ to: "IN_PROGRESS", label: "Resume" }, { to: "REJECTED", label: "Reject", tone: "danger" }],
    AWAITING_APPROVAL: [{ to: "IN_PROGRESS", label: "Back to work" }, { to: "COMPLETED", label: "Complete" }, { to: "REJECTED", label: "Reject", tone: "danger" }],
    COMPLETED: [{ to: "CLOSED", label: "Close" }],
    REJECTED: [{ to: "NEW", label: "Reopen" }],
    CLOSED: [],
  };

  return (
    <>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="surface p-4 lg:col-span-2">
          <h2 className="text-sm font-medium mb-3">Detail</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Row label="Description"><span className="whitespace-pre-wrap">{cr.description}</span></Row>
            <Row label="Category">{cr.category}</Row>
            <Row label="Department">{cr.departmentCode ?? "—"}</Row>
            <Row label="Requested by">{userMap.get(cr.requestedById) ?? "—"}</Row>
            <Row label="Assigned to">{cr.assignedToId ? userMap.get(cr.assignedToId) : "Unassigned"}</Row>
            <Row label="Due">{fmtDate(cr.dueDate)}</Row>
            <Row label="Cost impact">{fmtMoney(cr.costImpact)}</Row>
            <Row label="Schedule impact">{cr.scheduleImpactDays} days</Row>
            <Row label="Safety impact"><span className="whitespace-pre-wrap">{cr.safetyImpact ?? "—"}</span></Row>
            {cr.linkedChangeOrder && (
              <Row label="Linked CO">
                <Link href={`/change-orders/${cr.linkedChangeOrder.id}`} className="text-accent">
                  {cr.linkedChangeOrder.number}
                </Link>
              </Row>
            )}
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            {(transitions[cr.status] ?? []).map((t) => (
              <form key={t.to} action={async () => { "use server"; await transitionCrewRequest(cr.id, t.to); }}>
                <button className={t.tone === "danger" ? "btn-danger" : "btn-primary"}>{t.label}</button>
              </form>
            ))}
          </div>
        </div>

        <div className="surface p-4">
          <h2 className="text-sm font-medium mb-3">Assignment</h2>
          {hasPermission(user, PERMISSIONS.CR_ASSIGN) ? (
            <form action={assignCrewRequest} className="space-y-2">
              <input type="hidden" name="id" value={cr.id} />
              <Field label="Assign to">
                <Select name="assignedToId" defaultValue={cr.assignedToId ?? ""}>
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
              <button className="btn-primary">Save</button>
            </form>
          ) : (
            <p className="text-sm text-muted">{cr.assignedToId ? userMap.get(cr.assignedToId) : "Unassigned"}</p>
          )}
        </div>
      </div>

      <div className="surface p-4">
        <h2 className="text-sm font-medium mb-3">Comments</h2>
        <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
          {cr.comments.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
          {cr.comments.map((c) => (
            <div key={c.id} className="text-sm">
              <div className="text-xs text-muted">
                {userMap.get(c.authorId) ?? "—"} · {fmtDateTime(c.createdAt)}
              </div>
              <div className="whitespace-pre-wrap">{c.body}</div>
            </div>
          ))}
        </div>
        <form action={addCrewRequestComment} className="space-y-2 max-w-2xl">
          <input type="hidden" name="id" value={cr.id} />
          <Field label="Add a comment">
            <Textarea name="body" required />
          </Field>
          <button className="btn-primary">Post comment</button>
        </form>
      </div>

      <div className="mt-4 flex justify-end">
        <Link href="/crew-requests" className="btn-ghost">← Back</Link>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-white">{children}</dd>
    </div>
  );
}
