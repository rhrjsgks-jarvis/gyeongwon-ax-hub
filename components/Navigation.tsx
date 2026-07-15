'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/',        label: '허브',      icon: '🏠' },
  { href: '/finder',  label: '모델파인더', icon: '🔍' },
  { href: '/care',    label: 'AI Care',   icon: '💚' },
  { href: '/test',    label: '레벨업테스트', icon: '📝' },
  { href: '/compare', label: '타사비교',  icon: '⚡' },
  { href: '/install', label: '설치환경',  icon: '🛠️' },
]

export default function Navigation() {
  const pathname = usePathname()

  return (
    <>
      <header
        style={{ height: 'var(--nav-height)', background: 'var(--color-primary)' }}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 shadow-md"
      >
        <Link href="/" className="flex items-center gap-2 text-white no-underline">
          <span className="text-xl font-black tracking-tight">SAMSUNG</span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            경원 AX 허브
          </span>
        </Link>
        <span className="text-white text-xs opacity-60">경원영업팀</span>
      </header>

      {/* 하단 탭 — 5개 전체 표시 (slice 제거) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-center no-underline transition-colors relative"
              style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              {active && (
                <span
                  className="absolute bottom-0 w-5 h-0.5 rounded-full"
                  style={{ background: 'var(--color-primary)' }}
                />
              )}
            </Link>
          )
        })}
      </nav>

      {/* 사이드바 (데스크탑) */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 flex-col pt-16 pb-4 bg-white border-r border-gray-200 z-40">
        <div className="px-3 py-4 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium no-underline transition-all"
                style={{
                  background: active ? 'rgba(20, 40, 160, 0.08)' : 'transparent',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  fontWeight: active ? 700 : 500,
                }}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
        <div className="mt-auto px-4 py-3 mx-3 rounded-xl bg-gray-50 text-xs text-gray-400 text-center">
          경원영업팀 AX 경진대회<br />
          <span className="font-semibold text-gray-500">2026</span>
        </div>
      </aside>
    </>
  )
}
