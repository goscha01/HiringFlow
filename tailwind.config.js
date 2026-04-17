/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        // Mono is used heavily across the refreshed designs for eyebrows, table
        // headers, IDs, durations, counts. Do not collapse to sans.
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Refreshed palette (matches Design/design_handoff_hirefunnel/README.md)
        brand: {
          // Orange ramp — primary remains 500 to keep existing class references valid.
          50:  '#FFF3DF', // brandDim
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#FF9500', // brand-primary
          600: '#EA8500',
          700: '#C2710A', // badge fg on brandDim
          800: '#9A5B0D',
          900: '#7C4A0E',
          primary: '#FF9500',
          dim:     '#FFF3DF',
        },
        ink: {
          DEFAULT: '#1a1815',
        },
        // Warm grey / text ramps
        grey: {
          15: '#1a1815', // mapped to refreshed ink so existing class names adopt the new tone
          20: '#333333',
          30: '#4C4C4D',
          35: '#59595A', // dim
          40: '#656567',
          50: '#808080', // muted
          60: '#98989A',
          70: '#B0B0B2',
        },
        // App surfaces
        surface: {
          DEFAULT: '#FAF8F5', // bg — warm off-white
          light:   '#FCFAF6', // header row bg
          card:    '#FFFFFF',
          border:  '#EDE6D9',
          divider: '#F1EBE1',
          weak:    '#F7F3EB', // inline progress track
        },
        // Status tones — badges, score colors, deltas
        status: {
          'success-bg':  '#E6F4EA', 'success-fg': '#1F6A3A',
          'warn-bg':     '#FEF2D0', 'warn-fg':    '#8A6500',
          'danger-bg':   '#FDE4E1', 'danger-fg':  '#A93A2C',
          'info-bg':     '#E6EFF8', 'info-fg':    '#2E5A88',
          'brand-bg':    '#FFF3DF', 'brand-fg':   '#C2710A',
          'neutral-bg':  '#F1EBE1', 'neutral-fg': '#59595A',
        },
      },
      borderRadius: {
        DEFAULT: '8px',
        lg:  '12px',
        xl:  '14px',     // card radius per design
        btn: '10px',     // default button radius (tweakable 2px/9999px)
      },
      boxShadow: {
        card:   '0 2px 6px rgba(26,24,21,0.06)',
        raised: '0 10px 30px -10px rgba(26,24,21,0.15)',
        brand:  '0 4px 10px rgba(255,149,0,0.25)',
      },
      letterSpacing: {
        mono:     '0.1em',   // standard mono eyebrow
        monowide: '0.12em',  // PageHeader eyebrow
        tight2:   '-0.02em', // display / h1
      },
    },
  },
  plugins: [],
}
