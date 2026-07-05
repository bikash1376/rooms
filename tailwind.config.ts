import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Vegas-noir control room
        void: "#0B0A1F",
        panel: "#16132E",
        "panel-2": "#1E1A3D",
        line: "#2C2752",
        ink: "#E8E4FF",
        dim: "#8580B0",
        muted: "#5A5680",
        // Neon signage
        magenta: "#FF3D8B",
        cyan: "#37E2D5",
        gold: "#FFC24B",
        // States
        recall: "#37E2D5", // memory-backed glow
        amnesia: "#6E6A8C", // dead static
        danger: "#FF5470",
      },
      fontFamily: {
        pixel: ["var(--font-pixel)", "monospace"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        geist: ["Geist", "system-ui", "sans-serif"],
        bitcount: ['"Bitcount Single"', "monospace"],
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(55,226,213,0.35), 0 0 24px -4px rgba(55,226,213,0.45)",
        signage: "0 0 0 1px rgba(255,61,139,0.4), 0 0 32px -6px rgba(255,61,139,0.5)",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "41%": { opacity: "1" },
          "42%": { opacity: "0.35" },
          "43%": { opacity: "1" },
          "88%": { opacity: "1" },
          "89%": { opacity: "0.6" },
          "90%": { opacity: "1" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        flicker: "flicker 6s linear infinite",
        scan: "scan 7s linear infinite",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
