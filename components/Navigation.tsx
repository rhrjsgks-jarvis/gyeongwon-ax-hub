'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SamsungWordmark from './SamsungWordmark'
import Icon, { IconName } from './Icon'

// 허브·통합검색은 **그룹 밖 최상단**이다. 둘 다 '도구'가 아니라 진입점이고,
// 좁은 화면에서는 하단 탭이, 넓은 화면에서는 사이드바 맨 위가 같은 역할을 한다.
const NAV_ENTRY = [
  { href: '/',       label: '허브',     icon: 'home' as IconName },
  { href: '/search', label: '통합검색', icon: 'search' as IconName },
]

// 데스크탑 사이드바 전용 그룹 — 허브 메인 섹션 구성과 동일하게 유지
const NAV_GROUPS = [
  {
    title: '제품 상담 도구',
    items: [
      { href: '/finder',          label: '제품 상세검색',     icon: 'finder' as IconName },
      { href: '/care',            label: 'AI구독 케어',         icon: 'care' as IconName },
      { href: '/compare',         label: '타사비교',         icon: 'compare' as IconName },
      { href: '/install',         label: '설치환경 가이드',   icon: 'install' as IconName },
      { href: '/as',               label: 'AS 관련 정보',     icon: 'warranty' as IconName },
      { href: '/place',           label: '배치 시뮬레이터',   icon: 'place' as IconName },
    ],
  },
  {
    title: '교육',
    items: [
      { href: '/test', label: '레벨업 챌린지',   icon: 'quiz' as IconName },
      { href: '/quiz', label: 'URL 퀴즈 생성기', icon: 'target' as IconName },
    ],
  },
  {
    title: '매장운영 도구',
    items: [
      { href: '/#coupon',    label: '쿠폰 배포프로그램', icon: 'coupon' as IconName },
      { href: '/#concierge', label: '컨시어지',        icon: 'ticket' as IconName },
      { href: '/poster',     label: '접수 포스터',      icon: 'qr' as IconName },
    ],
  },
]

// 사용현황 대시보드 — 그룹에 속하지 않고 사이드바 최하단에 별도 운영
const ADMIN_LINK = { href: '/admin', label: '사용현황 대시보드[관리자용]', icon: 'dashboard' as IconName }

/*
 * 좁은 화면 하단 바로가기 — **큰 분류만 담는다**(2026-08-11 사용자 요청).
 *
 * 한때 사이드바의 '제품 상담 도구' 여섯 개를 그대로 뽑아 8칸을 만들었는데, 한 줄에 여덟은
 * 글자가 두 줄로 접혀 읽히지 않았다. 하단 바는 **분류로 들어가는 문**이지 도구 목록이 아니다.
 *
 * '교육'·'매장운영'은 페이지가 아니라 분류라 도구가 여럿이므로, **허브의 그 섹션으로**
 * 데려간다(`app/page.tsx` 의 `SECTION_ID` · `ANCHOR_SECTION`). 링크만 걸고 섹션 id 를
 * 안 만들면 모바일에서 접힌 채라 아무 일도 안 일어난다 — 둘을 함께 볼 것.
 */
const NAV_ITEMS = [
  { href: '/',       label: '허브',           icon: 'home' as IconName },
  { href: '/search', label: '통합검색',        icon: 'search' as IconName },
  { href: '/#tools', label: '제품 상담 도구',   icon: 'finder' as IconName },
  { href: '/#edu',   label: '교육',           icon: 'quiz' as IconName },
  { href: '/place',  label: '배치 시뮬레이터',  icon: 'place' as IconName },
  { href: '/as',     label: 'AS 관련 정보',    icon: 'warranty' as IconName },
]

export default function Navigation() {
  const pathname = usePathname()
  /*
   * 공유는 **앱 헤더 우측 상단**이 맡는다(2026-08-11 사용자 요청). 미니앱 안에 떠 있던
   * 버튼은 본문을 덮었고(AS 안내문 첫 줄이 실제로 가려져 자리를 비워 두고 있었다)
   * 화면마다 자리가 달라 눈이 헤맸다.
   *
   * 만들 것이 있을 때만 보인다 — 미니앱이 `share-state` 로 알려 준다. 띄워 두고 눌렀을 때
   * "공유할 내용이 없습니다"만 뜨면 고장으로 읽힌다(네 앱이 이미 지키던 규칙이다).
   */
  const [canShare, setCanShare] = useState(false)
  useEffect(() => {
    setCanShare(false) // 페이지를 옮기면 새 화면이 알려 줄 때까지 감춘다
    let answered = false
    function onMsg(e: MessageEvent) {
      if (e.data && e.data.sk === 'share-state') { answered = true; setCanShare(!!e.data.on) }
    }
    window.addEventListener('message', onMsg)
    /*
     * **알림만 기다리지 않고 물어본다.** 미니앱이 먼저 뜨고 헤더가 나중에 듣기 시작하면
     * 그 한 번이 유실돼, 공유할 것이 있는데도 아이콘이 끝내 안 떴다(AS 에서 실제로 그랬다).
     * 미니앱이 뜰 때까지 잠깐 되물어 본다 — 답이 오면 멈춘다.
     */
    const t = setInterval(() => {
      if (answered) { clearInterval(t); return }
      document.querySelector('iframe')?.contentWindow?.postMessage({ sk: 'share-ping' }, '*')
    }, 250)
    const stop = setTimeout(() => clearInterval(t), 6000)
    return () => { clearInterval(t); clearTimeout(stop); window.removeEventListener('message', onMsg) }
  }, [pathname])

  function share() {
    // 카드를 그리는 데 필요한 DOM 이 미니앱 안에 있으므로, 만들기는 그쪽에 맡긴다
    const f = document.querySelector('iframe')
    f?.contentWindow?.postMessage({ sk: 'share-click' }, '*')
  }
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
          {/* 공식 워드마크 — 글꼴로 친 "SAMSUNG" 은 글자 모양이 달라 로고가 아니다 */}
          <SamsungWordmark height={17} />
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            세일즈 코파일럿
          </span>
        </Link>
        {/* 오른쪽 — 팀 이름은 왼쪽으로 밀고 그 자리에 공유 아이콘을 고정한다 */}
        <div className="flex items-center gap-2.5">
          <span className="text-white text-xs opacity-60">경원영업팀</span>
          {canShare && (
            <button
              type="button"
              onClick={share}
              aria-label="이 화면 공유하기"
              title="이 화면 공유하기"
              className="flex items-center justify-center rounded-full text-white"
              style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.18)' }}
            >
              <Icon name="share" size={16} />
            </button>
          )}
        </div>
      </header>

      {/* 하단 탭 — 5개 전체 표시 (slice 제거) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          /*
           * 분류 탭('제품 상담 도구'·'교육')은 **평범한 `<a>`** 로 둔다.
           * Next 의 `<Link>` 는 해시만 다른 이동에서 `hashchange` 를 일으키지 않아,
           * 허브에 있는 상태에서 누르면 **주소만 바뀌고 섹션이 접힌 채 그대로**였다
           * (2026-08-11 실측). 브라우저에 맡기면 같은 화면에서는 hashchange 가,
           * 다른 화면에서는 새로 뜨면서 마운트가 그 일을 한다.
           */
          const Tag: any = item.href.includes('#') ? 'a' : Link
          return (
            <Tag
              key={item.href}
              href={item.href}
              className="flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 gap-0.5 text-center no-underline transition-colors relative"
              style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
            >
              <Icon name={item.icon} size={19} />
              <span className="text-[9px] font-medium leading-tight break-keep px-0.5">{item.label}</span>
              {active && (
                <span
                  className="absolute bottom-0 w-5 h-0.5 rounded-full"
                  style={{ background: 'var(--color-primary)' }}
                />
              )}
            </Tag>
          )
        })}
      </nav>

      {/* 사이드바 (데스크탑) */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-56 flex-col pt-16 pb-4 bg-white border-r border-gray-200 z-40">
        {/* 통합검색을 '제품 상담 도구' 그룹에 넣었더니 상단 검색창·하단 탭과 겹쳐
            한 화면에 셋이 됐다(2026-08-11 사용자 지적: *"너무 중복입니다"*). */}
        <div className="px-3 py-4 flex flex-col gap-1">
          {NAV_ENTRY.map((item) => {
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
                <Icon name={item.icon} size={19} />
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
                  <Icon
                    name="chevron"
                    size={9}
                    className="transition-transform"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  />
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
                          <Icon name={item.icon} size={17} />
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* 사용현황 대시보드 — 그룹에 속하지 않고 최하단에 별도 노출 */}
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
              <Icon name={ADMIN_LINK.icon} size={19} />
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
