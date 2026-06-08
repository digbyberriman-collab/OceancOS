const STATS = [
  { value: "$2.4B+", label: "In change orders tracked" },
  { value: "4", label: "Approval stages, fully configurable" },
  { value: "9", label: "Stakeholder roles supported" },
  { value: "100%", label: "Decisions captured in the audit log" },
];

export function Stats() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="surface panel-glow overflow-hidden">
          <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="bg-ink-900 px-6 py-10 text-center">
                <div className="tnum font-display text-4xl font-bold tracking-tight gradient-text sm:text-5xl">
                  {s.value}
                </div>
                <div className="mx-auto mt-3 max-w-[18ch] text-sm text-pretty text-muted">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-faint">
          Illustrative figures shown for demonstration.
        </p>
      </div>
    </section>
  );
}
