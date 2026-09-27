// Short labels built from a project's own fields.
//
// Kept pure and separate from the pages so the wording is the same wherever a
// project is named, and so a missing field drops out of the label instead of
// leaving a dangling separator ("Y701 ·").

type LabelProject = { code: string | null; yardName: string | null };

/** "Y701 · Navantia Cartagena", "Y701" with no yard, "Yard" with neither. */
export function projectEyebrow(project: LabelProject): string {
  const parts = [project.code, project.yardName].map((p) => p?.trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : "Yard";
}
