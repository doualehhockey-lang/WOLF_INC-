// frontend/tailwind.config.js

/** @type {import('tailwindcss').Config} */
export default {
  // Dark mode toggled by adding class="dark" on <html>.
  darkMode: 'class',

  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],

  theme: {
    extend: {
      colors: {
        // Brand palette — used as wolf-* utilities.
        wolf: {
          50: '#f0f4ff',
          100: '#dce8ff',
          200: '#b3caff',
          300: '#7aa4ff',
          400: '#4070f4',
          500: '#2952e3',
          600: '#1e3ec9',
          700: '#1730a0',
          800: '#172982',
          900: '#17256b',
          950: '#0f1540',
        },
        // Semantic surface tokens for dark/light modes.
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        border: 'var(--color-border)',
        'text-base': 'var(--color-text-base)',
        'text-muted': 'var(--color-text-muted)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-dot': 'pulseDot 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: 0, transform: 'translateY(4px)' },
          to: { opacity: 1, transform: 'none' },
        },
        pulseDot: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
      },
    },
  },

  plugins: [],
};
