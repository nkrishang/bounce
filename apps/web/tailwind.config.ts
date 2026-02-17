import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        border: 'var(--border)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        'secondary-foreground': 'var(--secondary-foreground)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        'dark-surface': 'var(--dark-surface)',
        'dark-surface-foreground': 'var(--dark-surface-foreground)',
        'dark-border': 'var(--dark-border)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        'btn-shine': 'btnShine 3s ease-in-out infinite',
        'btn-glow': 'btnGlow 2.5s ease-in-out infinite',
        'btn-shine-blue': 'btnShineBlue 3s ease-in-out infinite',
        'btn-glow-blue': 'btnGlowBlue 2.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        btnShine: {
          '0%': { transform: 'translateX(-100%) skewX(-15deg)', opacity: '0' },
          '5%': { opacity: '1' },
          '35%': { opacity: '1' },
          '45%': { transform: 'translateX(300%) skewX(-15deg)', opacity: '0' },
          '100%': { transform: 'translateX(300%) skewX(-15deg)', opacity: '0' },
        },
        btnGlow: {
          '0%, 100%': {
            boxShadow: '0 0 12px -2px rgba(236, 194, 94, 0.15), inset 0 0 12px -4px rgba(236, 194, 94, 0.05)',
            borderColor: 'rgba(236, 194, 94, 0.2)',
          },
          '50%': {
            boxShadow: '0 0 20px -2px rgba(236, 194, 94, 0.3), inset 0 0 16px -4px rgba(236, 194, 94, 0.1)',
            borderColor: 'rgba(236, 194, 94, 0.4)',
          },
        },
        btnShineBlue: {
          '0%': { transform: 'translateX(-100%) skewX(-15deg)', opacity: '0' },
          '5%': { opacity: '1' },
          '35%': { opacity: '1' },
          '45%': { transform: 'translateX(300%) skewX(-15deg)', opacity: '0' },
          '100%': { transform: 'translateX(300%) skewX(-15deg)', opacity: '0' },
        },
        btnGlowBlue: {
          '0%, 100%': {
            boxShadow: '0 0 12px -2px rgba(97, 166, 251, 0.15), inset 0 0 12px -4px rgba(97, 166, 251, 0.05)',
            borderColor: 'rgba(97, 166, 251, 0.2)',
          },
          '50%': {
            boxShadow: '0 0 20px -2px rgba(97, 166, 251, 0.3), inset 0 0 16px -4px rgba(97, 166, 251, 0.1)',
            borderColor: 'rgba(97, 166, 251, 0.4)',
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
