import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cyber: {
          black: "#0B0F12",
          dark: "#0E1318",
          surface: "#111920",
          card: "#131B23",

          border: "rgb(30 45 61 / <alpha-value>)",
          green: "rgb(0 255 127 / <alpha-value>)",
          lime: "rgb(118 185 0 / <alpha-value>)",
          cyan: "rgb(0 229 255 / <alpha-value>)",

          glow: "rgb(0 255 127 / 0.15)",
        },
      },
      fontFamily: {
        sans: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        "neon-green":
          "0 0 20px rgba(0, 255, 127, 0.3), 0 0 60px rgba(0, 255, 127, 0.1)",
        "neon-cyan":
          "0 0 20px rgba(0, 229, 255, 0.25), 0 0 60px rgba(0, 229, 255, 0.08)",
        "card-float":
          "0 25px 60px rgba(0, 0, 0, 0.5), 0 0 1px rgba(0, 255, 127, 0.15)",
        "inner-glow":
          "inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 0 30px rgba(0, 255, 127, 0.03)",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(0, 255, 127, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 127, 0.03) 1px, transparent 1px)",
        "glow-radial":
          "radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(0, 255, 127, 0.06), transparent 40%)",
      },
      backgroundSize: {
        "grid-60": "60px 60px",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        glitch: {
          "0%, 100%": { transform: "translate(0)" },
          "20%": { transform: "translate(-2px, 1px)" },
          "40%": { transform: "translate(2px, -1px)" },
          "60%": { transform: "translate(-1px, 2px)" },
          "80%": { transform: "translate(1px, -2px)" },
        },
        "beam-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "scan-line": "scan-line 4s linear infinite",
        glitch: "glitch 0.3s ease-in-out",
        "beam-flow": "beam-flow 3s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
