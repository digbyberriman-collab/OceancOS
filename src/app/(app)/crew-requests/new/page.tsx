import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { CREW_REQUEST_CATEGORIES, DEPARTMENTS, PRIORITIES } from "@/lib/enums";
import { createCrewRequest } from "../actions";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewCrewRequest() {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CR_CREATE);
  const projects = await prisma.project.findMany({ where: { archivedAt: null }, include: { vessel: true } });
  const users = await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const areas = await prisma.vesselArea.findMany();
  const cos = await prisma.changeOrder.findMany({ where: { status: { notIn: ["CLOSED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <Link
          href="/crew-requests"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          Crew Requests
        </Link>
        <PageHeader
          title="New Crew Request"
          eyebrow="Crew Requests"
          subtitle="Capture an operational item with a clear owner and due date."
        />
      </div>

      <form action={createCrewRequest} className="max-w-2xl space-y-0">
        {/* Project & core */}
        <div className="surface p-6 rounded-b-none border-b-0 space-y-5">
          <div className="eyebrow mb-1">Project</div>
          <Field label="Project">
            <Select name="projectId" required>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.vessel.name} — {p.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Details */}
        <div className="surface p-6 rounded-none border-t-0 border-b-0 space-y-5">
          <div className="eyebrow mb-1">Request Details</div>
          <Field label="Title">
            <Input name="title" required minLength={3} maxLength={200} placeholder="Brief description of the request…" />
          </Field>
          <Field label="Description">
            <Textarea name="description" required placeholder="Full details, context, and what resolution looks like…" />
          </Field>
        </div>

        {/* Classification */}
        <div className="surface p-6 rounded-none border-t-0 border-b-0 space-y-5">
          <div className="eyebrow mb-1">Classification</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Category">
              <Select name="category" required defaultValue="OPERATIONAL">
                {CREW_REQUEST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
            <Field label="Department">
              <Select name="departmentCode" defaultValue="">
                <option value="">— No department</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Vessel Area">
              <Select name="vesselAreaId" defaultValue="">
                <option value="">— No area</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue="MEDIUM">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
        </div>

        {/* Assignment & scheduling */}
        <div className="surface p-6 rounded-none border-t-0 border-b-0 space-y-5">
          <div className="eyebrow mb-1">Assignment &amp; Scheduling</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Assign To">
              <Select name="assignedToId" defaultValue="">
                <option value="">— Unassigned (triage)</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label="Due Date">
              <Input type="date" name="dueDate" />
            </Field>
          </div>
        </div>

        {/* Impact */}
        <div className="surface p-6 rounded-none border-t-0 border-b-0 space-y-5">
          <div className="eyebrow mb-1">Impact</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Cost Impact (EUR)">
              <Input type="number" name="costImpact" min={0} step="0.01" defaultValue={0} />
            </Field>
            <Field label="Schedule Impact (days)">
              <Input type="number" name="scheduleImpactDays" defaultValue={0} />
            </Field>
          </div>
          <Field label="Safety Impact">
            <Textarea name="safetyImpact" placeholder="Describe any safety implications…" />
          </Field>
        </div>

        {/* Links & submit */}
        <div className="surface p-6 rounded-t-none border-t-0 space-y-5">
          <div className="eyebrow mb-1">Links</div>
          <Field label="Linked Change Order">
            <Select name="linkedChangeOrderId" defaultValue="">
              <option value="">— No linked change order</option>
              {cos.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.title}</option>)}
            </Select>
          </Field>

          <div className="pt-4 flex items-center justify-between gap-4 border-t border-line mt-2">
            <p className="text-xs text-muted">
              The request will be created in <span className="font-medium text-white">New</span> status and routed for triage.
            </p>
            <button className="btn-primary btn-lg" type="submit">
              Create Request
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
