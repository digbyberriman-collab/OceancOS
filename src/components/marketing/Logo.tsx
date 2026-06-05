import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2.5 rounded-lg ${className}`}
      aria-label="OceancOS home"
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-lg bg-brand-gradient font-display text-[17px] font-bold leading-none text-white shadow-glow"
      >
        O
      </span>
      <span className="font-display text-[17px] font-semibold tracking-tight text-white">
        Oceanc<span className="text-marine">OS</span>
      </span>
    </Link>
  );
}
