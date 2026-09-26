"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { setThemeAction } from "@/app/(app)/_actions";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * The profile button: who is signed in, and the theme.
 *
 * A <details> disclosure, so it opens and the theme can be changed without
 * JavaScript. With JavaScript the new theme applies before the server answers,
 * and the panel closes on an outside click or Escape.
 */
export function UserMenu({
  name,
  email,
  role,
  initials,
  theme,
}: {
  name: string;
  email: string;
  role: string;
  initials: string;
  theme: Theme;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className="relative ml-1 border-l border-line pl-2">
      <summary
        aria-label={`Account and theme for ${name}`}
        className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-ink-800/70 [&::-webkit-details-marker]:hidden"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-700 text-xs font-semibold text-white ring-1 ring-line-strong">
          {initials}
        </span>
        <span className="hidden text-right text-xs leading-tight sm:block">
          <span className="block font-medium text-white">{name}</span>
          <span className="block text-faint">{role}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-faint" aria-hidden />
      </summary>

      <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-line bg-ink-900 p-3 shadow-floating">
        <div className="border-b border-line-soft px-1 pb-3">
          <p className="truncate text-sm font-medium text-white">{name}</p>
          <p className="truncate text-xs text-muted">{email}</p>
        </div>
        <form action={setThemeAction} className="pt-3">
          <input type="hidden" name="returnTo" value={returnTo} />
          <fieldset>
            <legend className="mb-2 px-1 text-xs font-medium text-muted">Theme</legend>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-950 p-1 ring-1 ring-line">
              {OPTIONS.map(({ value, label, icon: Icon }) => {
                const active = theme === value;
                return (
                  <button
                    key={value}
                    type="submit"
                    name="theme"
                    value={value}
                    aria-pressed={active}
                    onClick={() => {
                      const shell = document.getElementById("app-shell");
                      if (shell) shell.dataset.appTheme = value;
                      if (ref.current) ref.current.open = false;
                    }}
                    className={cn(
                      "flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-xs font-medium transition-colors",
                      active
                        ? "bg-ink-800 text-white ring-1 ring-marine/70"
                        : "text-muted hover:bg-ink-800/60 hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-2 px-1 text-xs text-faint">System follows your device&apos;s setting.</p>
        </form>
      </div>
    </details>
  );
}
