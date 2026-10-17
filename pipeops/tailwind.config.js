/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: Object.fromEntries([950, 900, 850, 800, 700, 600, 500, 400, 300, 200, 100, 50].map((k) => [k, `rgb(var(--ink-${k}) / <alpha-value>)`])),
        signal: { DEFAULT: 'rgb(var(--signal) / <alpha-value>)' },
        'on-signal': 'rgb(var(--on-signal) / <alpha-value>)',
        cost: { DEFAULT: 'rgb(var(--cost) / <alpha-value>)' },
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
