import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0B",
        surface: "#17171A",
        "text-primary": "#F2F0EB",
        "text-muted": "#8C8A85",
        "brand-accent": "#D97B3F",
        "risk-allow": "#4ADE80",
        "risk-sanitize": "#EAB308",
        "risk-quarantine": "#F87171",
      },
    },
  },
  plugins: [],
};

export default config;
