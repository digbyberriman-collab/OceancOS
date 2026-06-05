const NAMES = [
  "NORTHERN YARDS",
  "Azura Fleet",
  "MERIDIAN MARINE",
  "Cap Ferrat Refit",
  "BLUEWATER GROUP",
  "Helm & Hull",
];

export function TrustBar() {
  return (
    <section className="border-y border-line bg-ink-950/40">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-faint">
          Trusted by shipyards, management offices and fleets worldwide
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {NAMES.map((n) => (
            <span
              key={n}
              className="font-display text-base font-semibold tracking-wide text-muted/70 transition-colors duration-150 hover:text-muted"
            >
              {n}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
