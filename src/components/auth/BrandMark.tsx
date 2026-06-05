/**
 * Gradient "O" brand mark for OceancOS. Pure CSS/SVG, no image assets.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative grid place-items-center rounded-2xl bg-brand-gradient text-white font-semibold shadow-glow ${className}`}
      aria-hidden="true"
    >
      <span className="text-[1.35em] leading-none tracking-tightest">O</span>
      <span className="pointer-events-none absolute inset-0 rounded-2xl shadow-inner-line" />
    </div>
  );
}
