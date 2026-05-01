import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0052CC',
        'primary-dark': '#003F9E',
        'primary-soft': '#DEEBFF',
        accent: '#5CDCA5',
        'accent-dark': '#3BBF87',
        'accent-soft': '#E7F9F1',
        warning: '#FF8B00',
        success: '#36B37E',
        danger: '#DE350B',
        bg: '#F4F5F7',
        'bg-warm': '#EBECF0',
        surface: '#FFFFFF',
        text: '#172B4D',
        muted: '#6B778C',
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(135deg, #0052CC 0%, #003F9E 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['Sora', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
