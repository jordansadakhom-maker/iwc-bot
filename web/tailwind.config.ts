import type { Config } from "tailwindcss";

/**
 * Design system IWC — les couleurs pointent vers des variables CSS (voir app/globals.css),
 * ce qui permet le dark/light ET la bascule de pôle (or ↔ rouge sang) sans dupliquer les classes.
 */
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
        accent: "var(--accent)",
        "accent-hi": "var(--accent-hi)",
        brass: "var(--brass)",
        oxblood: "var(--oxblood)",
        steel: "var(--steel)",
        good: "var(--good)",
        warn: "var(--warn)",
        crit: "var(--crit)",
      },
      fontFamily: {
        display: "var(--font-display)",
        sans: "var(--font-ui)",
        num: "var(--font-num)",
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 18px 40px -18px rgba(0,0,0,.55), 0 2px 6px -2px rgba(0,0,0,.5)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        rise: "rise .5s cubic-bezier(.2,.7,.3,1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
