import Link from "next/link";
import { AlertCircle, CheckCircle2, Ship } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SectionCard } from "@/components/workflow/SectionCard";
import { toDateInputValue } from "@/lib/projectDates";
import { projectTiming } from "@/lib/metrics/project";
import { fmtDate } from "@/lib/utils";
import { updateProjectAction, type ProjectFormFlash } from "./actions";
import { readFormFlash } from "@/lib/formFlash";
import { FlashCleanup } from "@/components/ui/FlashCleanup";

export const dynamic = "force-dynamic";

const CURRENCIES = ["EUR", "GBP", "USD", "AED"];

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: { id?: string; saved?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.PROJ_EDIT)) {
    return (
      <EmptyState
        headingLevel={1}
        title="Forbidden"
        hint="Editing projects is restricted to the project manager and the owner's representative."
      />
    );
  }

  const projects = await prisma.project.findMany({
    where: { archivedAt: null },
    include: { vessel: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  if (!projects.length) {
    return <EmptyState headingLevel={1} icon={<Ship size={20} />} title="No projects yet" />;
  }

  const selected = projects.find((p) => p.id === searchParams.id) ?? projects[0];
  const flash = readFormFlash<ProjectFormFlash>(`project-${selected.id}`);
  const timing = projectTiming({
    arrivalDate: selected.arrivalDate,
    departureDate: selected.departureDate,
  });

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Administration"
        title="Projects"
        subtitle="Project codes and yard periods. These dates drive the timing cards and the progress against the clock."
      />

      {flash && <FlashCleanup name={`project-${selected.id}`} />}
      {searchParams.saved && !flash && (
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-ok/30 bg-ok/10 px-3.5 py-3 text-sm text-ok"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Project saved.</span>
        </div>
      )}
      {flash && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{flash.error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Project picker */}
        <nav aria-label="Projects" className="space-y-1.5">
          {projects.map((project) => {
            const active = project.id === selected.id;
            return (
              <Link
                key={project.id}
                href={`/admin/projects?id=${project.id}`}
                aria-current={active ? "true" : undefined}
                className={`block rounded-lg border px-3 py-2.5 transition-colors ${
                  active
                    ? "border-line-strong bg-ink-800"
                    : "border-line-soft bg-ink-900/50 hover:border-line hover:bg-ink-850"
                }`}
              >
                <div className="text-sm font-medium text-white">
                  {project.code ?? project.name}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {project.vessel.name} · {project.name}
                </div>
              </Link>
            );
          })}
        </nav>

        <SectionCard title={`${selected.vessel.name} — ${selected.name}`}>
          <form action={updateProjectAction} className="space-y-5">
            <input type="hidden" name="id" value={selected.id} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Project code" hint="Shown in the header switcher">
                <Input name="code" defaultValue={flash?.values.code ?? selected.code ?? ""} placeholder="R-00721" />
              </Field>
              <Field label="Yard">
                <Input
                  name="yardName"
                  defaultValue={flash?.values.yardName ?? selected.yardName ?? ""}
                  placeholder="MB92 La Ciotat"
                />
              </Field>
              <Field label="Currency">
                <Select name="currency" defaultValue={flash?.values.currency ?? selected.currency}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div>
              <h3 className="eyebrow mb-3">Yard period</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Arrival">
                  <Input
                    type="date"
                    name="arrivalDate"
                    defaultValue={flash?.values.arrivalDate ?? toDateInputValue(selected.arrivalDate)}
                  />
                </Field>
                <Field label="Haul out">
                  <Input
                    type="date"
                    name="haulOutDate"
                    defaultValue={flash?.values.haulOutDate ?? toDateInputValue(selected.haulOutDate)}
                  />
                </Field>
                <Field label="Sea trials">
                  <Input
                    type="date"
                    name="seaTrialsDate"
                    defaultValue={flash?.values.seaTrialsDate ?? toDateInputValue(selected.seaTrialsDate)}
                  />
                </Field>
                <Field label="Departure">
                  <Input
                    type="date"
                    name="departureDate"
                    defaultValue={flash?.values.departureDate ?? toDateInputValue(selected.departureDate)}
                  />
                </Field>
              </div>
            </div>

            {/* What these dates currently produce, so a mistake is obvious here
                rather than on the dashboard. */}
            <div className="rounded-lg border border-line-soft bg-ink-950/50 px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted">
                Currently reads as
              </div>
              {timing.onsiteDays === null ? (
                <p className="mt-1.5 text-sm text-muted">
                  Set arrival and departure to show a yard period.
                </p>
              ) : (
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                  <Reading label="Onsite for" value={`${timing.onsiteDays} days`} />
                  <Reading
                    label="Started"
                    value={
                      timing.startedDaysAgo === null
                        ? "—"
                        : timing.startedDaysAgo >= 0
                          ? `${timing.startedDaysAgo} days ago`
                          : `in ${Math.abs(timing.startedDaysAgo)} days`
                    }
                  />
                  <Reading
                    label="Finishes"
                    value={
                      timing.finishInDays === null
                        ? "—"
                        : timing.finishInDays >= 0
                          ? `in ${timing.finishInDays} days`
                          : `${Math.abs(timing.finishInDays)} days ago`
                    }
                  />
                  <Reading
                    label="Time elapsed"
                    value={timing.timePct === null ? "—" : `${Math.round(timing.timePct)}%`}
                  />
                </dl>
              )}
            </div>

            <div className="flex items-center gap-3">
              <SubmitButton className="btn-primary" pendingText="Saving…">Save project</SubmitButton>
              <span className="text-xs text-faint">
                Last updated {fmtDate(selected.updatedAt)}
              </span>
            </div>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-white tnum">{value}</dd>
    </div>
  );
}
