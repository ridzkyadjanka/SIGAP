import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#C8102E", dark: "#A00D25", light: "#FDECEF" },
        navy: { DEFAULT: "#14213D", light: "#1F3260", soft: "#E8ECF4" },
        surface: "#F5F7FA",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      gridTemplateColumns: { 14: "repeat(14, minmax(0, 1fr))" },
      boxShadow: {
        card: "0 1px 2px rgba(20,33,61,0.06), 0 1px 3px rgba(20,33,61,0.04)",
      },
    },
  },
  plugins: [],
} satisfies Config;
