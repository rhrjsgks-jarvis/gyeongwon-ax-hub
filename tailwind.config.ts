import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        samsung: {
          blue: '#1428A0',
          'blue-light': '#2563EB',
          'blue-dark': '#0D1B7A',
          gray: '#F4F5F7',
          'gray-dark': '#6B7280',
          text: '#1A1A1A',
        },
      },
      fontFamily: {
        sans: ['Pretendard', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
