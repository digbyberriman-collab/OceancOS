import { CheckCircle2 } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/workflow/SectionCard";
import { DATA_GAP_PRIORITIES, DATA_GAP_STATUSES } from "@/lib/enums";
import { fmtDate } from "@/lib/utils";
import { updateDataGapAction } from "@/app/(app)/vessels/actions";

export type DataGapRow = {
  id: string;
  scope: string;
  priority: string;
  issue: string;
  treatment: string | null;
  evidenceNeeded: string | null;
  status: string;
  resolutionNote: string | null;
  closedAt: Date | null;
};

const STATUS_LABEL: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", CLOSED: "Closed" };

/** Open first, then by priority. */
export function sortGaps<T extends Pick<DataGapRow, "status" | "priority">>(gaps: T[]): T[] {
  const status = (s: string) => (s === "CLOSED" ? 1 : 0);
  const priority = (p: string) => {
    const i = DATA_GAP_PRIORITIES.indexOf(p as (typeof DATA_GAP_PRIORITIES)[number]);
    return i === -1 ? DATA_GAP_PRIORITIES.length : i;
  };
  return [...gaps].sort((a, b) => status(a.status) - status(b.status) || priority(a.priority) - priority(b.priority));
}

/**
 * What still needs evidence before the particulars can be relied on, with the
 * document that would close each item. Status is editable in place.
 */
export function VesselDataGaps({
  gaps,
  canEdit,
  returnTo,
  title = "Data gaps",
  emptyHint = "Nothing is waiting on evidence.",
}: {
  gaps: DataGapRow[];
  canEdit: boolean;
  returnTo: string;
  title?: string;
  emptyHint?: string;
}) {
  const open = gaps.filter((g) => g.status !== "CLOSED").length;
  return (
    <SectionCard
      title={title}
      headerRight={<span className="text-xs text-muted tnum">{open} open · {gaps.length - open} closed</span>}
      noPad
    >
      {gaps.length === 0 ? (
        <p className="flex items-center gap-2 p-5 text-sm text-muted">
          <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />
          {emptyHint}
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {sortGaps(gaps).map((gap) => (
            <li key={gap.id} className="px-5 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge value={gap.priority} />
                    <span className="text-sm font-medium text-white">{gap.issue}</span>
                  </div>
                  <p className="mt-1 text-xs text-faint">{gap.scope}</p>
                </div>
                <StatusBadge value={gap.status} />
              </div>
              {gap.treatment && <p className="mt-2 text-sm text-muted">{gap.treatment}</p>}
              {gap.evidenceNeeded && (
                <p className="mt-1.5 text-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">To close: </span>
                  <span className="text-white/90">{gap.evidenceNeeded}</span>
                </p>
              )}
              {gap.resolutionNote && (
                <p className="mt-1.5 text-sm text-ok/90">
                  {gap.resolutionNote}
                  {gap.closedAt && <span className="ml-1.5 text-xs text-faint">· closed {fmtDate(gap.closedAt)}</span>}
                </p>
              )}
              {canEdit && (
                <details className="group mt-2">
                  <summary className="cursor-pointer list-none text-xs font-medium text-accent-bright hover:text-marine">
                    Update status
                  </summary>
                  <form action={updateDataGapAction} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={gap.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <label className="block">
                      <span className="sr-only">Status</span>
                      <select name="status" defaultValue={gap.status} className="input-base py-1.5 text-xs">
                        {DATA_GAP_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block min-w-[200px] flex-1">
                      <span className="sr-only">Resolution note</span>
                      <input
                        name="resolutionNote"
                        defaultValue={gap.resolutionNote ?? ""}
                        placeholder="Evidence received, e.g. ITC dated 12 Oct 2026"
                        className="input-base py-1.5 text-xs"
                      />
                    </label>
                    <button className="btn py-1.5 text-xs">Save</button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
