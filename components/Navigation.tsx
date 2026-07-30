'use client'

import { useState } from 'react'
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

// 데스크탑 사이드바 전용 그룹 — 허브 메인 섹션 구성과 동일하게 유지
const NAV_GROUPS = [
  {
    title: '🔍 제품 상담 도구',
    items: [
      { href: '/finder',          label: '모델파인더',       icon: '🔍' },
      { href: '/care',            label: 'AI Care',         icon: '💚' },
      { href: '/compare',         label: '타사비교',         icon: '🔗' },
      { href: '/compare-instant', label: '즉시비교 (개선중)', icon: '⚡' },
      { href: '/install',         label: '설치환경 가이드',   icon: '🛠️' },
    ],
  },
  {
    title: '📚 교육',
    items: [
      { href: '/test', label: '레벨업테스트',   icon: '📝' },
      { href: '/quiz', label: 'URL 퀴즈 생성', icon: '🎯' },
    ],
  },
  {
    title: '🏬 매장운영 도구',
    items: [
      { href: '/#concierge', label: '컨시어지',        icon: '🎫' },
      { href: '/#coupon',    label: '쿠폰 배포프로그램', icon: '🎁' },
      { href: '/#catalog',   label: '모바일 카탈로그',  icon: '📱' },
    ],
  },
]

// AX 현황 대시보드 — 그룹에 속하지 않고 사이드바 최하단에 별도 운영
const ADMIN_LINK = { href: '/admin', label: 'AX 현황 대시보드', icon: '📊' }

export default function Navigation() {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    NAV_GROUPS.forEach((group) => {
      initial[group.title] = group.items.some(
        (item) => pathname === item.href || (!item.href.includes('#') && item.href !== '/' && pathname.startsWith(item.href))
      )
    })
    return initial
  })

  function toggleGroup(title: string) {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }))
  }

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
          {NAV_ITEMS.filter((item) => item.href === '/').map((item) => {
            const active = pathname === item.href
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
        <div className="px-3 pt-3 mt-2 border-t border-gray-100 flex-1 overflow-y-auto flex flex-col gap-3">
          {NAV_GROUPS.map((group) => {
            const isOpen = !!openGroups[group.title]
            return (
              <div key={group.title}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className="w-full flex items-center justify-between px-3 mb-1 py-1 rounded-lg text-[10px] font-semibold text-gray-400 uppercase tracking-wide hover:bg-gray-50 hover:text-gray-600 transition-colors"
                >
                  <span>{group.title}</span>
                  <span
                    className="text-[9px] transition-transform"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  >
                    ▶
                  </span>
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const active = pathname === item.href || (!item.href.includes('#') && item.href !== '/' && pathname.startsWith(item.href))
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-xl text-[13px] font-medium no-underline transition-all"
                          style={{
                            background: active ? 'rgba(20, 40, 160, 0.08)' : 'transparent',
                            color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: active ? 700 : 500,
                          }}
                        >
                          <span className="text-sm">{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* AX 현황 대시보드 — 그룹에 속하지 않고 최하단에 별도 노출 */}
          <div className="pt-2 border-t border-gray-100">
            <Link
              href={ADMIN_LINK.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium no-underline transition-all"
              style={{
                background: pathname.startsWith(ADMIN_LINK.href) ? 'rgba(20, 40, 160, 0.08)' : 'transparent',
                color: pathname.startsWith(ADMIN_LINK.href) ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontWeight: pathname.startsWith(ADMIN_LINK.href) ? 700 : 500,
              }}
            >
              <span className="text-base">{ADMIN_LINK.icon}</span>
              <span>{ADMIN_LINK.label}</span>
            </Link>
          </div>
        </div>
        <div className="mt-auto px-4 py-3 mx-3 rounded-xl bg-gray-50 text-xs text-gray-400 text-center shrink-0">
          경원영업팀 AX 경진대회<br />
          <span className="font-semibold text-gray-500">2026</span>
        </div>
      </aside>
    </>
  )
}
