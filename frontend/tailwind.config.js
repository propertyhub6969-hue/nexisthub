/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#1A56DB',
          600: '#1547C0',
          700: '#1240AA',
        },
        accent: {
          500: '#22C55E',
          600: '#16A34A',
        },
        sidebar: '#0F1F4D',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
