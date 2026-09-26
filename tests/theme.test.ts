import { describe, it, expect } from "vitest";
import { DEFAULT_THEME, THEMES, parseTheme, safeReturnPath, themeColor } from "@/lib/theme";

describe("theme preference", () => {
  it("defaults to dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme("")).toBe("dark");
  });

  it("accepts exactly the three offered themes", () => {
    expect(THEMES).toEqual(["dark", "light", "system"]);
    for (const t of THEMES) expect(parseTheme(t)).toBe(t);
  });

  it("falls back to dark for anything else", () => {
    expect(parseTheme("Light")).toBe("dark");
    expect(parseTheme("sepia")).toBe("dark");
    expect(parseTheme(["light"])).toBe("dark");
  });

  it("matches the browser chrome to the theme, following the device for System", () => {
    expect(themeColor("dark")).toBe("#060912");
    expect(themeColor("light")).toBe("#eef2f7");
    expect(themeColor("system")).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#eef2f7" },
      { media: "(prefers-color-scheme: dark)", color: "#060912" },
    ]);
  });
});

describe("return path after changing theme", () => {
  it("keeps a same-origin path, query included", () => {
    expect(safeReturnPath("/jobs?view=pending")).toBe("/jobs?view=pending");
    expect(safeReturnPath("/change-orders/abc")).toBe("/change-orders/abc");
  });

  it("refuses anything that could leave the site", () => {
    expect(safeReturnPath("https://evil.example")).toBe("/dashboard");
    expect(safeReturnPath("//evil.example")).toBe("/dashboard");
    expect(safeReturnPath("/\\evil.example")).toBe("/dashboard");
    expect(safeReturnPath("jobs")).toBe("/dashboard");
    expect(safeReturnPath(undefined)).toBe("/dashboard");
  });
});
