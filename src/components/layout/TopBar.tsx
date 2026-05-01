import Link from "next/link";
import { logoutAction } from "@/app/(app)/_actions";

export function TopBar({
  user,
}: {
  user: { name: string; email: string; roleKeys: string[] };
}) {
  return (
    <header className="h-14 border-b border-line bg-ink-950 sticky top-0 z-10 flex items-center px-4 gap-4">
      <form action="/search" className="flex-1 max-w-xl">
        <input
          name="q"
          placeholder="Search change orders, requests, drawings, documents…"
          className="input-base"
        />
      </form>
      <div className="ml-auto flex items-center gap-3">
        <Link href="/notifications" className="btn-ghost">Inbox</Link>
        <div className="text-right text-xs leading-tight">
          <div className="text-white">{user.name}</div>
          <div className="text-muted">{user.roleKeys[0] ?? "GUEST"}</div>
        </div>
        <form action={logoutAction}>
          <button className="btn-ghost text-xs">Sign out</button>
        </form>
      </div>
    </header>
  );
}
