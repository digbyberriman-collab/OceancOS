import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep maritime navy scale — surfaces from darkest (canvas) to raised
        ink: {
          950: "#060912",
          900: "#0a0f1c",
          850: "#0e1525",
          800: "#121a2e",
          700: "#1a2440",
          600: "#243155",
          500: "#33426e",
        },
        line: {
          DEFAULT: "#1e2a48",
          soft: "#16203a",
          strong: "#2c3a60",
        },
        // Primary brand blue with a cyan highlight for gradients/glow
        accent: {
          DEFAULT: "#3b82f6",
          soft: "#1e3a8a",
          bright: "#60a5fa",
        },
        marine: "#38bdf8", // cyan highlight — premium maritime accent
        ok: "#22c55e",
        warn: "#f59e0b",
        bad: "#ef4444",
        muted: "#8294b3",
        faint: "#5a6b8c",
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
        card: "0 1px 2px rgba(0,0,0,0.30), 0 1px 1px rgba(0,0,0,0.20)",
        raised: "0 6px 16px -4px rgba(0,0,0,0.45), 0 2px 6px -2px rgba(0,0,0,0.35)",
        floating: "0 18px 40px -12px rgba(0,0,0,0.60), 0 6px 14px -6px rgba(0,0,0,0.45)",
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
  plugins: [],
};
export default config;
