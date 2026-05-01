import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#070b12", 900: "#0c1320", 800: "#121a2b", 700: "#1a2440", 600: "#243155" },
        line: "#1d2742",
        accent: { DEFAULT: "#3b82f6", soft: "#1e3a8a" },
        ok: "#16a34a",
        warn: "#d97706",
        bad: "#dc2626",
        muted: "#7c8aa6",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Inter", "sans-serif"],
        mono: ["ui-monospace", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
