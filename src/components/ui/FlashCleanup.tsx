"use client";

import { useEffect } from "react";
import { flashCookieName } from "@/lib/formFlashName";

/**
 * Clears a one-shot flash cookie once the page that reads it has mounted —
 * see lib/formFlash.ts for why this can't just happen server-side. Render
 * this once, next to wherever `readFormFlash` was called, only when there
 * was actually something to clear (an unconditional render would strip a
 * flash meant for a page that hasn't rendered yet, on every page that
 * happens to import this).
 */
export function FlashCleanup({ name }: { name: string }) {
  useEffect(() => {
    document.cookie = `${flashCookieName(name)}=; Max-Age=0; path=/; SameSite=Lax`;
  }, [name]);
  return null;
}
