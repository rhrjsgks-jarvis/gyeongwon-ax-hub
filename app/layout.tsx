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
      <body>
        <ServiceWorker />
        <Navigation />
        <FeedbackButton />
        <main
          className="pt-[60px] md:pl-56 min-h-screen"
          style={{ background: 'var(--color-bg)' }}
        >
          <div className="p-4 md:p-6 pb-24 md:pb-6">
            {children}
          </div>
        </main>
      </body>
    </html>
  )
}
