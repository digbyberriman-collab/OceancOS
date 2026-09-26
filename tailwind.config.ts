import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

// Colour tokens are CSS variables holding RGB channels, so opacity classes such
// as `bg-ink-900/80` keep working and the whole app can change theme by
// redefining the variables. Dark is the default and its values are the
// original palette, unchanged.
//
// The light values invert the ink scale (canvas and cards become the lightest
// steps) and darken the signal colours until every text pair clears 4.5:1 on
// the canvas, the cards and the button fill.
const DARK = {
  "ink-950": "6 9 18", //       #060912 canvas
  "ink-900": "10 15 28", //     #0a0f1c cards
  "ink-850": "14 21 37", //     #0e1525
  "ink-800": "18 26 46", //     #121a2e button fill, hover rows
  "ink-700": "26 36 64", //     #1a2440
  "ink-600": "36 49 85", //     #243155
  "ink-500": "51 66 110", //    #33426e
  line: "30 42 72", //          #1e2a48
  "line-soft": "22 32 58", //   #16203a
  "line-strong": "44 58 96", // #2c3a60
  accent: "59 130 246", //      #3b82f6
  "accent-soft": "30 58 138", //#1e3a8a
  "accent-bright": "96 165 250", // #60a5fa
  marine: "56 189 248", //      #38bdf8
  ok: "34 197 94", //           #22c55e
  warn: "245 158 11", //        #f59e0b
  bad: "239 68 68", //          #ef4444
  muted: "130 148 179", //      #8294b3
  faint: "90 107 140", //       #5a6b8c
  fg: "255 255 255", //         primary text, what `text-white` means
  "text-body": "231 236 245", //#e7ecf5 inherited body text
  "chart-recessive": "130 148 179", // #8294b3 elapsed time, cancelled work
  "shadow-card": "0 1px 2px rgba(0,0,0,0.30), 0 1px 1px rgba(0,0,0,0.20)",
  "shadow-raised": "0 6px 16px -4px rgba(0,0,0,0.45), 0 2px 6px -2px rgba(0,0,0,0.35)",
  "shadow-floating": "0 18px 40px -12px rgba(0,0,0,0.60), 0 6px 14px -6px rgba(0,0,0,0.45)",
};

const LIGHT: typeof DARK = {
  "ink-950": "238 242 247", //  #eef2f7 canvas
  "ink-900": "255 255 255", //  #ffffff cards
  "ink-850": "245 247 251", //  #f5f7fb
  "ink-800": "233 238 245", //  #e9eef5 button fill, hover rows
  "ink-700": "219 226 237", //  #dbe2ed
  "ink-600": "199 208 222", //  #c7d0de
  "ink-500": "170 182 200", //  #aab6c8
  line: "213 220 232", //       #d5dce8
  "line-soft": "227 232 240", //#e3e8f0
  "line-strong": "184 194 211", // #b8c2d3
  accent: "37 99 235", //       #2563eb  white label 5.17
  "accent-soft": "191 219 254", // #bfdbfe
  "accent-bright": "29 78 216", // #1d4ed8 links 6.70 on white
  marine: "3 105 161", //       #0369a1  focus and active 5.28 on canvas
  ok: "4 120 87", //            #047857  4.88 on canvas
  warn: "164 72 10", //         #a4480a  5.32 on canvas
  bad: "185 28 28", //          #b91c1c  5.76 on canvas
  muted: "61 75 99", //         #3d4b63  7.83 on canvas
  faint: "86 99 123", //        #56637b  5.39 on canvas
  fg: "11 20 36", //            #0b1424
  "text-body": "17 27 45", //   #111b2d
  "chart-recessive": "133 148 170", // #8594aa recessive but 3.08 on white
  "shadow-card": "0 1px 2px rgba(15,23,42,0.06), 0 1px 1px rgba(15,23,42,0.04)",
  "shadow-raised": "0 6px 16px -6px rgba(15,23,42,0.14), 0 2px 6px -2px rgba(15,23,42,0.08)",
  "shadow-floating": "0 18px 40px -16px rgba(15,23,42,0.22), 0 6px 14px -6px rgba(15,23,42,0.10)",
};

const vars = (palette: typeof DARK) =>
  Object.fromEntries(Object.entries(palette).map(([k, v]) => [`--${k}`, v]));

const c = (name: keyof typeof DARK) => `rgb(var(--${name}) / <alpha-value>)`;

// The shell element carries data-app-theme. Light values apply to it directly,
// and to :root through :has() so the page canvas, the viewport scrollbar and
// native controls follow as well. Pages outside the shell (sign-in, marketing)
// never match, so they stay dark.
const themes = plugin(({ addBase }) => {
  const light = { ...vars(LIGHT), colorScheme: "light" };
  // In dark the shell stays transparent over the body's ambient backdrop, as
  // it always has; in light it paints its own canvas.
  const lightShell = { ...light, backgroundColor: "rgb(var(--ink-950))" };
  addBase({
    ":root": { ...vars(DARK), colorScheme: "dark" },
    '[data-app-theme="light"]': lightShell,
    ':root:has([data-app-theme="light"])': light,
    "@media (prefers-color-scheme: light)": {
      '[data-app-theme="system"]': lightShell,
      ':root:has([data-app-theme="system"])': light,
    },
  });
});

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: c("ink-950"),
          900: c("ink-900"),
          850: c("ink-850"),
          800: c("ink-800"),
          700: c("ink-700"),
          600: c("ink-600"),
          500: c("ink-500"),
        },
        line: {
          DEFAULT: c("line"),
          soft: c("line-soft"),
          strong: c("line-strong"),
        },
        accent: {
          DEFAULT: c("accent"),
          soft: c("accent-soft"),
          bright: c("accent-bright"),
        },
        marine: c("marine"),
        ok: c("ok"),
        warn: c("warn"),
        bad: c("bad"),
        muted: c("muted"),
        faint: c("faint"),
        // `text-white` is primary text; it turns dark in the light theme.
        white: c("fg"),
        body: c("text-body"),
        // Labels on blue and red fills stay white in every theme.
        "on-accent": "#ffffff",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Inter", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        raised: "var(--shadow-raised)",
        floating: "var(--shadow-floating)",
        glow: "0 0 0 1px rgba(59,130,246,0.30), 0 8px 30px -8px rgba(56,189,248,0.35)",
        "inner-line": "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)",
        "radial-glow":
          "radial-gradient(60% 50% at 50% 0%, rgba(56,189,248,0.16) 0%, rgba(59,130,246,0.06) 40%, transparent 75%)",
        "brand-gradient": "linear-gradient(135deg, #38bdf8 0%, #3b82f6 50%, #1e3a8a 100%)",
      },
      transitionTimingFunction: {
        "out-cubic": "cubic-bezier(0.215, 0.61, 0.355, 1)",
        "out-quint": "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease both",
        "fade-up": "fade-up 0.5s cubic-bezier(0.215,0.61,0.355,1) both",
        "scale-in": "scale-in 0.35s cubic-bezier(0.215,0.61,0.355,1) both",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [themes],
};
export default config;
