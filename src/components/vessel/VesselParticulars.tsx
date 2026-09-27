import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/workflow/SectionCard";
import { DefGrid, DefRow } from "@/components/workflow/DefinitionGrid";
import { cn } from "@/lib/utils";
import {
  VESSEL_SECTIONS,
  conflictingObservations,
  formatVesselValue,
  isWebUrl,
  type VesselField,
  type VesselParticulars as Particulars,
} from "@/lib/vessels/fields";

export type FieldObservation = { fieldKey: string | null; value: string; unit: string | null };

/**
 * Every particular of a vessel, section by section, in catalogue order. A
 * field with no value still renders — as a placeholder — so every vessel reads
 * the same and the gaps are obvious.
 */
export function VesselParticulars({
  vessel,
  observations,
  sections = VESSEL_SECTIONS,
}: {
  vessel: Partial<Particulars>;
  observations: FieldObservation[];
  sections?: typeof VESSEL_SECTIONS;
}) {
  return (
    <div className="gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
      {sections.map((section) => (
        <SectionCard key={section.key} title={section.title}>
          <DefGrid>
            {section.fields.map((field) => (
              <DefRow key={field.key} label={field.label} span2={field.wide}>
                <FieldValue
                  field={field}
                  value={vessel[field.key]}
                  observations={observations.filter((o) => o.fieldKey === field.key)}
                />
              </DefRow>
            ))}
          </DefGrid>
        </SectionCard>
      ))}
    </div>
  );
}

function FieldValue({
  field,
  value,
  observations,
}: {
  field: VesselField;
  value: Particulars[keyof Particulars] | undefined;
  observations: FieldObservation[];
}) {
  const text = formatVesselValue(field, value);

  if (text == null) {
    // Nothing preferred yet. If a source has published a figure, say so: it is
    // a lead to check, not a value to rely on.
    const lead = observations[observations.length - 1];
    return (
      <span id={`field-${field.key}`} className="text-faint">
        Not recorded
        {lead && (
          <a
            href={`#evidence-${field.key}`}
            className="ml-1.5 text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-white"
          >
            {observations.length === 1 ? "1 unverified observation" : `${observations.length} unverified observations`}
            : {lead.value}
            {lead.unit && !["year", "persons", "cabins"].includes(lead.unit) ? ` ${lead.unit}` : ""}
          </a>
        )}
      </span>
    );
  }

  const conflicts = conflictingObservations(field, value, observations);

  return (
    <span id={`field-${field.key}`} className="block">
      {field.kind === "url" && isWebUrl(text) ? (
        <a
          href={text}
          target="_blank"
          rel="noreferrer noopener"
          className="break-all text-accent-bright transition-colors hover:text-marine"
        >
          {text}
        </a>
      ) : (
        <span className={cn(field.kind === "longtext" ? "whitespace-pre-line text-muted" : "tnum")}>{text}</span>
      )}
      {conflicts.length > 0 && (
        <a href={`#evidence-${field.key}`} className="ml-2 align-middle">
          <Badge tone="warn">
            {conflicts.length === 1 ? "1 other value on record" : `${conflicts.length} other values on record`}
          </Badge>
        </a>
      )}
      {field.hint && <span className="mt-0.5 block text-[11px] text-faint">{field.hint}</span>}
    </span>
  );
}
