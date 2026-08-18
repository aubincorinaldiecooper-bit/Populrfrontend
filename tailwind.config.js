/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: {
          DEFAULT: 'hsl(var(--border))',
          subtle: 'hsl(var(--border-subtle))',
          strong: 'hsl(var(--border-strong))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: {
          DEFAULT: 'hsl(var(--foreground))',
          subtle: 'hsl(var(--foreground-subtle))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          soft: 'hsl(var(--success-soft))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          soft: 'hsl(var(--warning-soft))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
          muted: {
            DEFAULT: 'hsl(var(--sidebar-muted))',
            foreground: 'hsl(var(--sidebar-muted-foreground))',
          },
        },
        chartreuse: {
          DEFAULT: 'hsl(var(--pop-lime))',
          hover: 'hsl(78 90% 55%)',
        },
        coral: 'hsl(var(--pop-coral))',
        cream: 'hsl(var(--pop-cream))',

        // ─── Material-3 redesign palette (literal, single light theme) ───
        // Ported verbatim from the redesign mockups so their markup can be
        // reused directly. `bg-primary`/`bg-background`/`bg-secondary`/
        // `border`/`ring` continue to resolve through shadcn's CSS vars
        // (set to these same values in index.css), so shadcn primitives and
        // this token set stay visually identical.
        surface: {
          DEFAULT: '#faf9f6',
          dim: '#dbdad7',
          bright: '#faf9f6',
          variant: '#e3e2e0',
          tint: '#5e5e5e',
          'container-lowest': '#ffffff',
          'container-low': '#f4f3f1',
          container: '#efeeeb',
          'container-high': '#e9e8e5',
          'container-highest': '#e3e2e0',
        },
        'on-surface': '#1a1c1a',
        'on-surface-variant': '#4c4546',
        'on-background': '#1a1c1a',
        outline: {
          DEFAULT: '#7e7576',
          variant: '#cfc4c5',
        },
        'inverse-surface': '#2f312f',
        'inverse-on-surface': '#f2f1ee',
        'inverse-primary': '#c6c6c6',
        'on-primary': '#ffffff',
        'primary-container': '#1b1b1b',
        'on-primary-container': '#848484',
        'primary-fixed': '#e2e2e2',
        'primary-fixed-dim': '#c6c6c6',
        'on-primary-fixed': '#1b1b1b',
        'on-primary-fixed-variant': '#474747',
        olive: '#536500',
        'secondary-container': '#d3ef6c',
        'on-secondary-container': '#596c00',
        'secondary-fixed': '#d3ef6c',
        'secondary-fixed-dim': '#b7d253',
        'on-secondary': '#ffffff',
        'on-secondary-fixed': '#171e00',
        'on-secondary-fixed-variant': '#3e4c00',
        tertiary: '#000000',
        'tertiary-container': '#270058',
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#9c62ff',
        'tertiary-fixed': '#ebdcff',
        'tertiary-fixed-dim': '#d4bbff',
        'on-tertiary-fixed': '#270058',
        'on-tertiary-fixed-variant': '#5d00c2',
        error: {
          DEFAULT: '#ba1a1a',
          container: '#ffdad6',
        },
        'on-error': '#ffffff',
        'on-error-container': '#93000a',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '16px',
      },
      fontFamily: {
        // ─── One face ───
        // Geist is Populr's UI typeface — it's what the design-system theme
        // has rendered the whole app in, so every role resolves to it. The
        // roles stay as tokens (display/body/label) so hierarchy is carried
        // by size and weight, not by switching families. `sans` matters:
        // without it, Tailwind's preflight left <html> on the OS system
        // font, which showed for a frame before the theme mounted and in
        // anything that escaped the theme's wrapper (portals included).
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        geist: ['Geist', 'sans-serif'],
        // GeistMono is the one monospace, reserved for genuinely technical
        // values (a raw platform account id) and tabular metrics.
        mono: ['GeistMono', 'ui-monospace', 'monospace'],
        'geist-mono': ['GeistMono', 'ui-monospace', 'monospace'],
        display: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        body: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        label: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-lg-mobile': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '500' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
      },
      boxShadow: {
        card: '0 4px 16px rgba(17, 17, 17, 0.06)',
        drawer: '-4px 0 24px rgba(17, 17, 17, 0.08)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
      },
      transitionTimingFunction: {
        // The builder's easing: decisive start, long soft landing. Named so
        // a node lift, an edge highlight and a menu highlight all settle
        // with the same hand — three curves chosen separately would each be
        // fine and together feel like three products.
        'out-quint': 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
