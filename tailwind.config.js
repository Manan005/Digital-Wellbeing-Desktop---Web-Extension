/** @type {import('tailwindcss').Config} */

// Semantic colour tokens. Values live in src/index.css as RGB triplets on
// `:root` (light) and `:root[data-theme="dark"]`; the `<alpha-value>` slot keeps
// opacity modifiers (bg-overlay/50, shadow-accent/25) working.
const COLOR_TOKENS = [
  'canvas', 'card', 'card-hover', 'subtle', 'subtle-2', 'tile',
  'line', 'line-strong',
  'ink', 'ink-2', 'ink-3', 'ink-4', 'ink-inverse',
  'accent', 'accent-hover', 'accent-soft', 'accent-line', 'accent-idle',
  'tooltip', 'overlay',
  'danger', 'danger-soft', 'danger-line', 'success',
];

export default {
  // `dark:` variants are an escape hatch only; components should use the tokens.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'Google Sans', 'system-ui', 'sans-serif'],
      },
      colors: Object.fromEntries(
        COLOR_TOKENS.map((name) => [name, `rgb(var(--c-${name}) / <alpha-value>)`])
      ),
    },
  },
  plugins: [],
}
