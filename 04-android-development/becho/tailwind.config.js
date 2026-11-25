/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        becho: {
          background: '#0b0f19',
          surface: '#111827',
          elevated: '#1f2937',
          accent: '#22c55e',
          muted: '#9ca3af',
        },
      },
    },
  },
  plugins: [],
};
