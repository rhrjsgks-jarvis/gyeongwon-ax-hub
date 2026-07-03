import type { Metadata } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'

export const metadata: Metadata = {
  title: '경원 AX 허브',
  description: '경원영업팀 AI 영업지원 도구 통합 플랫폼',
  manifest: '/manifest.json',
  themeColor: '#1428A0',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '경원 AX 허브',
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
        <Navigation />
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
