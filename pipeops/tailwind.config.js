/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0A0B0D', 900: '#0F1013', 850: '#141519', 800: '#1A1B20', 700: '#24262C', 600: '#33363E', 500: '#4A4E58', 400: '#6B707C', 300: '#9095A0', 200: '#B9BDC6', 100: '#E4E6EB', 50: '#F4F5F7' },
        signal: { DEFAULT: '#C8FF4D', dim: '#8FB83A', glow: 'rgba(200,255,77,0.35)' },
        cost: { DEFAULT: '#FF7A52', dim: '#B85A3E' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: { tightest: '-0.055em' },
    },
  },
  plugins: [],
};
