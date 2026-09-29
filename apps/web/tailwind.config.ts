import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 8px 24px -6px rgba(0,0,0,0.5)",
        "glow-teal": "0 0 24px -4px rgba(20,184,166,0.45)",
        "glow-teal-lg": "0 0 40px -6px rgba(20,184,166,0.55)",
        "glow-cyan": "0 0 20px -4px rgba(34,211,238,0.4)",
      },
      backgroundImage: {
        "radial-fade":
          "radial-gradient(60% 50% at 50% 0%, rgba(20,184,166,0.16), transparent 70%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
