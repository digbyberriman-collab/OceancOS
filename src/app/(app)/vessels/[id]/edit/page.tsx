import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { canReachVessel } from "@/lib/vessels/access";
import { VESSEL_SECTIONS, type VesselField } from "@/lib/vessels/fields";
import { VESSEL_VERIFICATION, VESSEL_VERIFICATION_LABELS } from "@/lib/enums";
import { EmptyState, PageHeader } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { SectionCard } from "@/components/workflow/SectionCard";
import { fmtDateTime } from "@/lib/utils";
import { updateVesselAction } from "../../actions";

export const dynamic = "force-dynamic";

/** The particulars form: the catalogue again, as inputs, in the same order as the view. */
export default async function EditVesselPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { err?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.VESSEL_EDIT)) {
    return (
      <EmptyState
        title="Forbidden"
        hint="Editing vessel particulars is restricted to the owner's representative, project manager, technical manager and captain."
      />
    );
  }
  if (!(await canReachVessel(user.id, params.id))) return notFound();

  const vessel = await prisma.vessel.findUnique({ where: { id: params.id } });
  if (!vessel) return notFound();

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Edit particulars"
        title={vessel.name}
        subtitle="Blank fields stay as placeholders. Each value you change is also added to the vessel's field evidence with the basis given below, so earlier figures are kept."
        actions={
          <Link href={`/vessels/${vessel.id}`} className="btn-ghost">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to vessel
          </Link>
        }
      />

      {searchParams.err && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{searchParams.err}</span>
        </div>
      )}

      <form action={updateVesselAction} className="space-y-4">
        <input type="hidden" name="id" value={vessel.id} />

        <SectionCard title="Basis of these changes">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
            <Field
              label="Source / basis"
              hint="Recorded against every value you change, e.g. “Certificate of Registry, 3 Oct 2026”."
            >
              <Input name="basis" placeholder="Entered in OceancOS" maxLength={300} />
            </Field>
            <Field label="Verification status" hint="Certificate-verified once registry, tonnage and class documents are checked.">
              <Select name="verification" defaultValue={vessel.verification}>
                {VESSEL_VERIFICATION.map((v) => (
                  <option key={v} value={v}>
                    {VESSEL_VERIFICATION_LABELS[v]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </SectionCard>

        {VESSEL_SECTIONS.map((section) => (
          <SectionCard key={section.key} title={section.title}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={(vessel as Record<string, unknown>)[field.key]}
                />
              ))}
            </div>
          </SectionCard>
        ))}

        <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-line bg-ink-950/90 px-1 py-3 backdrop-blur">
          <button className="btn-primary">Save particulars</button>
          <Link href={`/vessels/${vessel.id}`} className="btn-ghost">
            Cancel
          </Link>
          <span className="text-xs text-faint">Last updated {fmtDateTime(vessel.updatedAt)}</span>
        </div>
      </form>
    </div>
  );
}

function defaultValue(field: VesselField, value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function FieldInput({ field, value }: { field: VesselField; value: unknown }) {
  const label = field.unit ? `${field.label} (${field.unit})` : field.label;
  const wide = field.wide ? "sm:col-span-2 lg:col-span-3" : undefined;
  const common = { name: field.key, defaultValue: defaultValue(field, value), placeholder: "Not recorded" };

  switch (field.kind) {
    case "longtext":
      return (
        <Field label={label} hint={field.hint} className={wide}>
          <Textarea {...common} className="min-h-[72px]" />
        </Field>
      );
    case "int":
      return (
        <Field label={label} hint={field.hint} className={wide}>
          <Input {...common} type="number" inputMode="numeric" min={0} step={1} />
        </Field>
      );
    case "decimal":
      return (
        <Field label={label} hint={field.hint} className={wide}>
          <Input {...common} type="number" inputMode="decimal" min={0} step="any" />
        </Field>
      );
    case "year":
      return (
        <Field label={label} hint={field.hint} className={wide}>
          <Input {...common} type="number" inputMode="numeric" min={1800} max={2100} step={1} />
        </Field>
      );
    case "date":
      return (
        <Field label={label} hint={field.hint} className={wide}>
          <Input {...common} type="date" />
        </Field>
      );
    case "url":
      return (
        <Field label={label} hint={field.hint} className={wide}>
          <Input {...common} type="url" placeholder="https://" />
        </Field>
      );
    default: {
      const extra =
        field.key === "imo"
          ? { pattern: "(IMO ?)?[0-9]{7}", title: "Seven digits", inputMode: "numeric" as const }
          : field.key === "mmsi"
            ? { pattern: "[0-9]{9}", title: "Nine digits", inputMode: "numeric" as const }
            : {};
      return (
        <Field label={label} hint={field.hint} className={wide}>
          <Input {...common} {...extra} required={field.key === "name"} />
        </Field>
      );
    }
  }
}
