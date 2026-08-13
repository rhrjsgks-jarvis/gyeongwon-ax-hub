import type { Metadata } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'
import FeedbackButton from '@/components/FeedbackButton'
import ServiceWorker from '@/components/ServiceWorker'

export const metadata: Metadata = {
  title: '세일즈 코파일럿',
  description: '경원영업팀 AI 영업지원 도구 통합 플랫폼',
  manifest: '/manifest.json',
  themeColor: '#1428A0',
  // 홈 화면에 추가했을 때 쓰는 아이콘 — iOS 는 manifest 의 icons 를 안 읽고 이것만 본다
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '세일즈 코파일럿',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        {/*
          Pretendard 는 **우리 도메인에 두고**(`public/vendor/fonts/`) **화면을 막지 않게**
          받는다. 두 가지가 각각 다른 사고를 막는다:

          ① `media="print"` — globals.css 의 `@import` 는 CSS 번들에 들어가 렌더를 막았고,
             글꼴이 늦으면 그동안 화면이 비어 있었다(실측: 폰트 응답을 기다리다 13초).
             늦게 와도 -apple-system 등 대체 글꼴로 먼저 읽힌다.
          ② **자체 호스팅** — CDN 은 매장 전파가 약하면 안 열리고, **서비스워커가 남의
             도메인 것을 캐시할 수 없다**(three.js·html2canvas 를 vendor 에 둔 것과 같은 이유).

          정적 전체판(굵기당 766KB) 대신 **가변 동적 서브셋**을 쓴다 — 34.5KB 조각 92개라
          `unicode-range` 로 그 화면에 실제로 쓰인 글자의 조각만 받는다. 굵기도 한 파일이
          전부 담는다. **CDN 으로 되돌리지 말 것.**
        */}
        {/* onLoad 는 서버 컴포넌트에서 쓸 수 없어 인라인 스크립트로 바꿔 준다 */}
        <link
          id="pretendard-css"
          rel="stylesheet"
          href="/vendor/fonts/pretendard-variable.css"
          media="print"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var l=document.getElementById('pretendard-css');if(!l)return;" +
              "var on=function(){l.media='all'};if(l.sheet)on();else l.addEventListener('load',on)})()",
          }}
        />
      </head>
      <body>
        <ServiceWorker />
        <Navigation />
        <FeedbackButton />
        <main
          className="pt-[60px] lg:pl-56 min-h-screen"
          style={{ background: 'var(--color-bg)' }}
        >
          <div className="p-4 lg:p-6 pb-24 lg:pb-6">
            {children}
          </div>
        </main>
      </body>
    </html>
  )
}
