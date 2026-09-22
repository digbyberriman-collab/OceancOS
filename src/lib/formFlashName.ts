// Just the cookie-naming convention shared by lib/formFlash.ts (server,
// imports next/headers) and components/ui/FlashCleanup.tsx (client). Kept
// separate so the client component never pulls next/headers into its
// bundle — importing it from formFlash.ts directly fails the build.

const PREFIX = "oc_flash_";

export function flashCookieName(key: string): string {
  return PREFIX + key;
}
