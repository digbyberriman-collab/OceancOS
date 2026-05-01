import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { DEPARTMENTS, PRIORITIES } from "@/lib/enums";
import { createChangeOrder } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewChangeOrderPage() {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CO_CREATE);
  const projects = await prisma.project.findMany({ where: { archivedAt: null }, include: { vessel: true } });
  const areas = await prisma.vesselArea.findMany();

  return (
    <>
      <PageHeader title="New change order" subtitle="Capture scope, cost, schedule and risk impact." />
      <form action={createChangeOrder} className="surface p-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
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
        <Field label="Reason for change" className="md:col-span-2">
          <Textarea name="reason" required />
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
        <Field label="Estimated cost (EUR)">
          <Input type="number" name="estimatedCost" min={0} step="0.01" defaultValue={0} />
        </Field>
        <Field label="Schedule impact (days)">
          <Input type="number" name="scheduleImpactDays" defaultValue={0} />
        </Field>
        <Field label="Risk impact" className="md:col-span-2">
          <Textarea name="riskImpact" placeholder="What risks does this introduce or mitigate?" />
        </Field>
        <Field label="Technical impact" className="md:col-span-2">
          <Textarea name="technicalImpact" placeholder="Affected systems, drawings, vendors…" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="needsClassReview" value="true" /> Requires class review
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="needsFlagReview" value="true" /> Requires flag review
        </label>
        <div className="md:col-span-2 flex justify-end gap-2">
          <button className="btn-primary">Create draft</button>
        </div>
      </form>
    </>
  );
}
