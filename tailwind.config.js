/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom Violet Theme Palette
        background: "#0b0a15", // Deep dark violet-black
        surface: "#181625",    // Dark violet-gray
        "surface-light": "#252236", // Lighter surface
        sidebar: "#0b0a15",    // Same as background for consistency
        primary: "#8b5cf6",    // Violet 500 (User's logo color)
        "primary-hover": "#7c3aed", // Violet 600
        secondary: "#10b981",  // Emerald 500
        text: "#ede9fe",       // Violet 50 (Very light)
        muted: "#8b86a8",      // Desaturated violet-gray
        divider: "#2e2a40",    // Divider color
        
        // Accents
        danger: "#ef4444",
        success: "#22c55e",
        warning: "#eab308",
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
