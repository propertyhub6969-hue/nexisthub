/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary: indigo-navy dalam (elegan, korporat) — dipakai tombol, link, state aktif
        brand: {
          50:  '#eef1f8',
          100: '#d7deef',
          500: '#2e4a86',
          600: '#26406f',
          700: '#1e325a',
        },
        // Aksen signature: kuningan/emas (segel resmi, emas sertifikat) — dipakai HEMAT
        brass: {
          400: '#c79a52',
          500: '#b5893f',
          600: '#9a7231',
        },
        accent: {
          500: '#16a34a',
          600: '#15803d',
        },
        sidebar: '#141b2d', // ink — navy nyaris hitam
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(20 27 45 / 0.04), 0 1px 3px 0 rgb(20 27 45 / 0.06)',
        soft: '0 4px 20px -4px rgb(20 27 45 / 0.10)',
      },
    },
  },
  plugins: [],
}
