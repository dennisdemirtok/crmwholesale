/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#faf5f0',
          100: '#f0e6d8',
          200: '#e0ccb0',
          300: '#d1b389',
          400: '#c19961',
          500: '#b2803a',
          600: '#9a6b2f',
          700: '#7d5626',
          800: '#65441f',
          900: '#4d3318',
        },
      },
    },
  },
  plugins: [],
};
