/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#111827",
        slateNight: "#1f2937",
        champagne: "#d6b981",
        terracotta: "#b76e5d",
        parchment: "#f4efe4"
      },
      boxShadow: {
        vault: "0 20px 60px rgba(12, 19, 31, 0.45)"
      },
      fontFamily: {
        sans: ["Outfit", "sans-serif"],
        serif: ["Cormorant Garamond", "serif"]
      },
      keyframes: {
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 rgba(214, 185, 129, 0)" },
          "50%": { boxShadow: "0 0 24px rgba(214, 185, 129, 0.22)" }
        }
      },
      animation: {
        riseIn: "riseIn 600ms ease-out both",
        pulseGlow: "pulseGlow 2000ms ease-in-out infinite"
      }
    }
  },
  plugins: []
};
