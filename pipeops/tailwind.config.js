/** @type {import('tailwindcss').Config} */
// Tokens from screenpipe's design guide (screenpipe/docs/DESIGN.md): ink, bone, trace,
// neutral signal, and phosphor only for work happening now.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0A',
        bone: '#F6F6F3',
        surface: '#FFFFFF',
        subtle: '#EFEFEB',
        line: '#DEDED8',
        trace: '#78786F',
        muted: '#666666',
        faint: '#999999',
        signal: '#333333',
        phosphor: '#C7FF3E',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        serif: ['"Crimson Text"', 'Baskerville', '"Times New Roman"', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { sm: '4px', md: '6px', lg: '8px', xl: '8px', '2xl': '8px' },
      transitionDuration: { DEFAULT: '150ms' },
    },
  },
  plugins: [],
};
