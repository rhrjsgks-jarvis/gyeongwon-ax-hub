import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // lg = 사이드바가 나오는 기준. 1024px 이상이거나, 900px 이상이면서 가로로 든 화면
      // (폴드8을 펼쳐 가로로 들면 CSS 폭이 약 930~1090px — 1024 한 값으로는 기기 설정에 따라 갈린다).
      // 세로로 든 태블릿(768~1023)은 예전처럼 하단 탭 — 사이드바가 카드를 누르던 문제가 그쪽이었다.
      screens: {
        lg: { raw: '(min-width: 1024px), (min-width: 900px) and (orientation: landscape)' },
      },
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
