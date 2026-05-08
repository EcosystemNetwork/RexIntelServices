import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        body: ["Inter Tight", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        brand: {
          green: {
            DEFAULT: "#5fb91f",
            hover: "#7bc83a",
            deep: "#3f8a14",
          },
          blue: {
            DEFAULT: "#1fa8e0",
            hover: "#3bc9ff",
            deep: "#0f7aa8",
          },
          steel: "#c9cdd4",
        },
        surface: {
          DEFAULT: "#111118",
          2: "#18181f",
          bg: "#0a0a0f",
        },
        ink: {
          DEFAULT: "#e8e8ef",
          muted: "#8888a0",
          dim: "#55556a",
        },
        line: {
          DEFAULT: "#2a2a35",
          subtle: "#1e1e28",
        },
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #5fb91f 0%, #1fa8e0 100%)",
      },
      boxShadow: {
        "glow-green": "0 0 24px rgba(95, 185, 31, 0.35)",
        "glow-blue": "0 0 24px rgba(31, 168, 224, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
