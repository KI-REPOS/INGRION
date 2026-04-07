/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          "blue-dark": "#0D1F33",
          "blue-mid": "#1A3A5C",
          "blue-light": "#2C4A6E",
          "blue-pale": "#EAF0F8",
          gold: "#C9A84C",
          "gold-light": "#F0D98A",
        },
        success: { green: "#2D7D46" },
        warning: { amber: "#B7791F" },
        danger: { red: "#C0392B" },
        role: {
          user: "#0D9488",
          validator: "#4338CA",
          regulator: "#9B1C1C",
          company: "#B45309",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
      animation: {
        "spin-slow": "spin 2s linear infinite",
        shimmer: "shimmer 1.5s ease-in-out infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-in": "slideIn 0.3s ease-out",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideIn: {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
