import type { Config } from "tailwindcss";

// Design system LSPD — les couleurs pointent vers des variables CSS (app/globals.css),
// ce qui permet le dark (identité principale) et le light sans dupliquer les classes.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "border-2": "var(--border-2)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        navy: "var(--navy)",
        "navy-hi": "var(--navy-hi)",
        gold: "var(--gold)",
        steel: "var(--steel)",
        good: "var(--good)",
        warn: "var(--warn)",
        crit: "var(--crit)",
      },
      fontFamily: {
        display: "var(--font-display)",
        sans: "var(--font-ui)",
        mono: "var(--font-mono)",
      },
      borderRadius: { card: "14px" },
      boxShadow: { card: "0 16px 38px -20px rgba(0,0,0,.6), 0 2px 6px -2px rgba(0,0,0,.45)" },
    },
  },
  plugins: [],
};

export default config;
