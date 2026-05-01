import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { CREW_REQUEST_CATEGORIES, DEPARTMENTS, PRIORITIES } from "@/lib/enums";
import { createCrewRequest } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCrewRequest() {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CR_CREATE);
  const projects = await prisma.project.findMany({ where: { archivedAt: null }, include: { vessel: true } });
  const users = await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const areas = await prisma.vesselArea.findMany();
  const cos = await prisma.changeOrder.findMany({ where: { status: { notIn: ["CLOSED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <>
      <PageHeader title="New crew request" subtitle="Capture an operational item with a clear owner." />
      <form action={createCrewRequest} className="surface p-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        <Field label="Project" className="md:col-span-2">
          <Select name="projectId" required>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.vessel.name} — {p.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Title" className="md:col-span-2">
          <Input name="title" required minLength={3} maxLength={200} />
        </Field>
        <Field label="Description" className="md:col-span-2">
          <Textarea name="description" required />
        </Field>
        <Field label="Category">
          <Select name="category" required defaultValue="OPERATIONAL">
            {CREW_REQUEST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Department">
          <Select name="departmentCode" defaultValue="">
            <option value="">—</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
        <Field label="Vessel area">
          <Select name="vesselAreaId" defaultValue="">
            <option value="">—</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select name="priority" defaultValue="MEDIUM">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Assign to">
          <Select name="assignedToId" defaultValue="">
            <option value="">— Unassigned (triage)</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" name="dueDate" />
        </Field>
        <Field label="Cost impact">
          <Input type="number" name="costImpact" min={0} step="0.01" defaultValue={0} />
        </Field>
        <Field label="Schedule impact (days)">
          <Input type="number" name="scheduleImpactDays" defaultValue={0} />
        </Field>
        <Field label="Safety impact" className="md:col-span-2">
          <Textarea name="safetyImpact" />
        </Field>
        <Field label="Linked change order" className="md:col-span-2">
          <Select name="linkedChangeOrderId" defaultValue="">
            <option value="">—</option>
            {cos.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.title}</option>)}
          </Select>
        </Field>
        <div className="md:col-span-2 flex justify-end">
          <button className="btn-primary">Create request</button>
        </div>
      </form>
    </>
  );
}
