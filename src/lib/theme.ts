export const THEMES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "oc_theme";
export const DEFAULT_THEME: Theme = "dark";

/** Anything missing or unrecognised falls back to dark, the default. */
export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

/**
 * Where to send the user back to after changing theme.
 *
 * Only a same-origin path is accepted, so the form cannot be used to bounce
 * someone to another site.
 */
export function safeReturnPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

/** Browser chrome colour per theme; System follows the device. */
export function themeColor(theme: Theme) {
  if (theme === "light") return "#eef2f7";
  if (theme === "system") {
    return [
      { media: "(prefers-color-scheme: light)", color: "#eef2f7" },
      { media: "(prefers-color-scheme: dark)", color: "#060912" },
    ];
  }
  return "#060912";
}
