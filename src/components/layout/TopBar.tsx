import Link from "next/link";
import { Search, Bell } from "lucide-react";
import { logoutAction } from "@/app/(app)/_actions";

export function TopBar({
  user,
}: {
  user: { name: string; email: string; roleKeys: string[] };
}) {
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="h-14 border-b border-line bg-ink-950/70 backdrop-blur-md sticky top-0 z-10 flex items-center px-4 gap-4">
      <form action="/search" className="flex-1 max-w-xl relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint"
          aria-hidden
        />
        <input
          name="q"
          aria-label="Search"
          placeholder="Search change orders, requests, drawings, documents…"
          className="input-base pl-9"
          spellCheck={false}
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="btn-ghost h-9 w-9 p-0"
        >
          <Bell className="h-4 w-4" aria-hidden />
        </Link>
        <div className="flex items-center gap-2.5 pl-2 ml-1 border-l border-line">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-ink-700 text-xs font-semibold text-white ring-1 ring-line-strong">
            {initials || "U"}
          </div>
          <div className="text-right text-xs leading-tight hidden sm:block">
            <div className="text-white font-medium">{user.name}</div>
            <div className="text-faint">{user.roleKeys[0] ?? "GUEST"}</div>
          </div>
        </div>
        <form action={logoutAction}>
          <button className="btn-ghost text-xs">Sign out</button>
        </form>
      </div>
    </header>
  );
}
