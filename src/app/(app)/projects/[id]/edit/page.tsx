import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { readFormFlash } from "@/lib/formFlash";
import { loadProjectOverview } from "@/lib/yardPeriods/access";
import { groupScope } from "@/lib/yardPeriods/display";
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_LEVELS,
  SCOPE_DISCIPLINES,
  SCOPE_DISCIPLINE_LABELS,
} from "@/lib/enums";
import { EmptyState, PageHeader } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FlashCleanup } from "@/components/ui/FlashCleanup";
import { SectionCard } from "@/components/workflow/SectionCard";
import {
  addScopeItemAction,
  reclassifyScopeItemAction,
  removeScopeItemAction,
  updateYardPeriodAction,
  type YardPeriodFormFlash,
} from "../../actions";

export const dynamic = "force-dynamic";

const DATE_HINT =
  'As published: "2019", "2012-Q2", "2013-09", "2017-Spring", "… approx." or "Date unverified"';

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

/**
 * Correct or fill in a historical yard period: its record, and its scope of
 * work by discipline. Dates stay at the precision the evidence gives.
 */
export default async function EditYardPeriodPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.PROJ_EDIT)) {
    return (
      <EmptyState
        headingLevel={1}
        title="Forbidden"
        hint="Editing a yard period is restricted to the project manager and the owner's representative."
      />
    );
  }
  const project = await loadProjectOverview(user.id, params.id);
  if (!project) return notFound();
  const record = project.yardPeriod;
  if (!record) {
    return (
      <EmptyState
        headingLevel={1}
        title="Not a historical yard period"
        hint="A live project's name, code and dates are edited in Project admin."
        action={
          <Link href={`/admin/projects?id=${project.id}`} className="btn">
            Project admin
          </Link>
        }
      />
    );
  }

  const flash = readFormFlash<YardPeriodFormFlash>(`yard-period-${project.id}`);
  const scopeFlash = readFormFlash<YardPeriodFormFlash>(`scope-${project.id}`);
  const v = (key: keyof typeof record) => flash?.values[key] ?? String(record[key] ?? "");
  const groups = groupScope(project.scopeItems);

  return (
    <div className="animate-fade-up space-y-5">
      {flash && <FlashCleanup name={`yard-period-${project.id}`} />}
      {scopeFlash && <FlashCleanup name={`scope-${project.id}`} />}
      <div>
        <Link
          href={`/projects/${project.id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-white"
        >
          <ArrowLeft size={13} />
          Back to the period
        </Link>
        <PageHeader
          eyebrow={[project.code, project.vessel.name].filter(Boolean).join(" · ")}
          title="Edit yard period"
          subtitle="Correct or fill in what the evidence shows. Dates stay at the precision the source gives; a later import of the register only fills what is still blank, so what you change here stays."
        />
      </div>

      {flash && <ErrorBanner message={flash.error} />}

      <SectionCard title="The period">
        <form action={updateYardPeriodAction} className="space-y-5">
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Type of period" className="sm:col-span-2">
              <Input name="periodType" defaultValue={v("periodType")} required maxLength={120} />
            </Field>
            <Field label="Name at the time">
              <Input name="nameAtPeriod" defaultValue={v("nameAtPeriod")} maxLength={120} />
            </Field>
            <Field label="Confidence">
              <Select name="confidence" defaultValue={v("confidence")}>
                <option value="">Not assessed</option>
                {CONFIDENCE_LEVELS.map((c) => (
                  <option key={c} value={c}>
                    {CONFIDENCE_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="From" hint={DATE_HINT}>
              <Input name="startLabel" defaultValue={v("startLabel")} required maxLength={40} />
            </Field>
            <Field label="To">
              <Input name="endLabel" defaultValue={v("endLabel")} required maxLength={40} />
            </Field>
            <Field label="Precision" hint='e.g. "Year", "Approx. 3 months"'>
              <Input name="precisionLabel" defaultValue={v("precisionLabel")} maxLength={60} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Yard" hint='"Unverified" if the source names none'>
              <Input name="yardText" defaultValue={v("yardText")} maxLength={160} />
            </Field>
            <Field label="City">
              <Input name="cityText" defaultValue={v("cityText")} maxLength={120} />
            </Field>
            <Field label="Country">
              <Input name="countryText" defaultValue={v("countryText")} maxLength={120} />
            </Field>
          </div>

          <Field label="Scope, as published">
            <Textarea name="scopeSummary" defaultValue={v("scopeSummary")} maxLength={4000} />
          </Field>
          <Field label="Contractors & designers" hint="Separate with semicolons">
            <Input name="contractorsText" defaultValue={v("contractorsText")} maxLength={1000} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Reported cost" hint='"Undisclosed" unless a source published a figure'>
              <Input name="reportedCostText" defaultValue={v("reportedCostText")} maxLength={120} />
            </Field>
            <Field label="Planning band" hint='e.g. "€3m–€10m"; a planning estimate, not spend'>
              <Input name="costBandLabel" defaultValue={v("costBandLabel")} maxLength={40} />
            </Field>
            <Field label="Basis of the band">
              <Input name="costBandBasis" defaultValue={v("costBandBasis")} maxLength={1000} />
            </Field>
          </div>

          <Field label="Notes and qualifications">
            <Textarea
              name="notes"
              defaultValue={v("notes")}
              maxLength={2000}
              className="min-h-[70px]"
            />
          </Field>

          <SubmitButton className="btn-primary" pendingText="Saving…">
            Save period
          </SubmitButton>
        </form>
      </SectionCard>

      <section id="scope" className="scroll-mt-24">
        <SectionCard title="Scope of work by discipline">
          {scopeFlash && <ErrorBanner message={scopeFlash.error} />}
          {groups.length === 0 ? (
            <p className="text-sm text-muted">No scope lines yet.</p>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.discipline}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-marine">
                    {g.label}
                  </h3>
                  <ul className="mt-2 divide-y divide-line-soft rounded-lg border border-line-soft">
                    {g.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 text-white">{item.description}</span>
                        <form
                          action={reclassifyScopeItemAction}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="itemId" value={item.id} />
                          <label className="sr-only" htmlFor={`discipline-${item.id}`}>
                            Discipline for {item.description}
                          </label>
                          <Select
                            id={`discipline-${item.id}`}
                            name="discipline"
                            defaultValue={item.discipline}
                            className="h-8 py-0 text-xs"
                          >
                            {SCOPE_DISCIPLINES.map((d) => (
                              <option key={d} value={d}>
                                {SCOPE_DISCIPLINE_LABELS[d]}
                              </option>
                            ))}
                          </Select>
                          <SubmitButton className="btn-ghost text-xs" pendingText="Moving…">
                            Move
                          </SubmitButton>
                        </form>
                        <form action={removeScopeItemAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <SubmitButton
                            className="btn-ghost text-xs text-bad"
                            pendingText="Removing…"
                          >
                            Remove
                          </SubmitButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <form
            action={addScopeItemAction}
            className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end"
          >
            <input type="hidden" name="projectId" value={project.id} />
            <Field label="Discipline">
              <Select name="discipline" defaultValue={scopeFlash?.values.discipline ?? "GENERAL"}>
                {SCOPE_DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {SCOPE_DISCIPLINE_LABELS[d]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Work done">
              <Input
                name="description"
                defaultValue={scopeFlash?.values.description ?? ""}
                maxLength={500}
                placeholder="e.g. Main engine 24,000-hour overhaul"
              />
            </Field>
            <SubmitButton className="btn" pendingText="Adding…">
              Add scope line
            </SubmitButton>
          </form>
        </SectionCard>
      </section>
    </div>
  );
}
