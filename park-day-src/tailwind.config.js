/**
 * Every colour is a CSS variable (see src/index.css) so the palette can flip
 * in dark mode. Tailwind cannot apply an opacity modifier such as `bg-card/95`
 * to a plain `var(--card)` and silently drops the class, so each colour is a
 * function that emits color-mix() when a modifier is present.
 */
const themeColor =
  (name) =>
  ({ opacityValue }) => {
    const alpha = Number(opacityValue);
    if (!Number.isFinite(alpha) || alpha >= 1) return `var(--${name})`;
    return `color-mix(in srgb, var(--${name}) ${Math.round(alpha * 100)}%, transparent)`;
  };

const names = [
  'paper',
  'card',
  'sunk',
  'ink',
  'muted',
  'line',
  'accent',
  'accent-ink',
  'accent-soft',
  'gold',
  'gold-soft',
  'band',
  'band-ink',
  'band-muted',
  'band-gold',
  'go',
  'go-soft',
  'soon',
  'soon-soft',
  'flex',
  'flex-soft',
  'later',
  'later-soft',
  'skip',
  'skip-soft',
  'hallow',
  'hallow-soft',
];

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map((n) => [n, themeColor(n)])),
      fontFamily: {
        sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Bodoni Moda', 'Didot', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};
