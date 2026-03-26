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
      },
      colors: {
        brand: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#FF9500', // Primary orange from Figma
          600: '#EA8500',
          700: '#C2710A',
          800: '#9A5B0D',
          900: '#7C4A0E',
        },
        grey: {
          15: '#262626',
          20: '#333333',
          30: '#4C4C4D',
          35: '#59595A',
          40: '#656567',
          50: '#808080',
          60: '#98989A',
          70: '#B0B0B2',
        },
        surface: {
          DEFAULT: '#F7F7F8', // White/97
          light: '#FCFCFD',   // White/99
          border: '#F1F1F3',  // White/95
          divider: '#E4E4E7', // White/90
        },
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
      },
    },
  },
  plugins: [],
}
