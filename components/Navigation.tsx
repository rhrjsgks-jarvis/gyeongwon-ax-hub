'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import SamsungWordmark from './SamsungWordmark'
import Icon, { IconName } from './Icon'
import { versionLabel } from '@/lib/version'
import FeedbackButton from './FeedbackButton'
import { getStoreCode, storeName, isTestStore } from '@/lib/stores'

/*
 * **지금 보고 있는 화면인가** — 경로는 글자가 아니라 **마디(segment)** 로 본다.
 *
 * 예전에는 `pathname.startsWith(href)` 였다. 그런데 `/install-cost` 는 `/install` 로
 * **시작**하므로, 설치비용을 열면 **설치환경 가이드까지 함께 켜져 보였다**
 * (2026-08-20 사장님 지적). 쓰는 데는 지장이 없지만 화면이 거짓말을 하는 셈이다.
 * 같거나 `href + '/'` 로 시작할 때만 그 아래 화면이다.
 *
 * **판정을 여기 한 곳에만 둔다.** 같은 검사가 파일 안에 다섯 군데 흩어져 있었고,
 * 한 곳만 고치면 나머지에서 또 난다(이 저장소가 허브 카드 수·앱 버전에서 반복해서
 * 데인 그 종류다).
 */
function isActive(pathname: string, href: string): boolean {
  if (href.includes('#') || href === '/') return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

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
      { href: '/finder',          label: '모델파인더',     icon: 'finder' as IconName },
      { href: '/care',            label: 'AI구독 케어',         icon: 'care' as IconName },
      { href: '/compare',         label: '타사비교',         icon: 'compare' as IconName },
      { href: '/install',         label: '설치환경 가이드',   icon: 'install' as IconName },
      { href: '/as',               label: 'AS 관련 정보',     icon: 'warranty' as IconName },
      { href: '/install-cost',     label: '설치비용 · 사전준비', icon: 'bolt' as IconName },
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
      { href: '/#coupon',    label: '쿠폰 배포 프로그램', icon: 'coupon' as IconName },
      { href: '/#concierge', label: '컨시어지',        icon: 'ticket' as IconName },
      { href: '/poster',     label: '접수 포스터',      icon: 'qr' as IconName },
    ],
  },
]

// 사용현황 대시보드 — 그룹에 속하지 않고 사이드바 최하단에 별도 운영
const ADMIN_LINK = { href: '/admin', label: '사용현황 대시보드[관리자용]', icon: 'dashboard' as IconName }
/*
 * 개발중인 서비스 — 사이드바 **최하단**에 잠긴 칸으로 둔다(2026-08-17 사용자 요청).
 * 아직 다듬는 중인 도구라 그대로 열어 두면 상담사가 반쯤 만든 화면을 고객에게 보여준다.
 * 자물쇠 아이콘을 함께 띄워 **누르기 전에 잠겨 있다는 것이 보이게** 한다.
 */
const DEV_LINK = { href: '/dev', label: '개발 중인 서비스', icon: 'build' as IconName }

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
  { href: '/as',     label: 'AS 관련 정보',    icon: 'warranty' as IconName },
]

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()

  /*
   * ── 뒤로가기 ───────────────────────────────────────────────────
   * **설치해서 쓰면 브라우저 뒤로가기가 없다**(`manifest.json` 이 `display:standalone`).
   * 매장 태블릿은 대개 홈 화면에 설치해서 쓰므로, 미니앱 안의 배선(`back-kit.js`)이
   * 다 맞아도 **누를 버튼이 없어서** 뒤로가기가 없는 앱이 된다(2026-08-28 사장님 지적).
   *
   * **브라우저 뒤로가기와 같은 일을 한다** — 미니앱이 시트·모달을 열며 쌓아 둔 칸이 있으면
   * 그것부터 닫히고, 없으면 앞 화면으로 간다. 버튼을 따로 만들지 않고 히스토리를 쓰는 이유가
   * 그것이다(두 갈래로 만들면 "버튼은 닫는데 뒤로가기는 벗어난다"가 된다).
   *
   * **셀 수 없을 때는 허브로 보낸다.** 카카오톡 링크로 곧장 들어온 경우 앞에 우리 화면이
   * 없어 `history.back()` 이 앱을 통째로 벗어난다. 부모 프레임은 자식 iframe 이 쌓은
   * 칸을 못 읽으므로(실측: `history.state` 가 null) 정확히 셀 방법이 없다 —
   * 대신 **틀려도 안전한 쪽**으로 물러선다. 허브는 언제나 옳은 목적지다.
   */
  const moves = useRef(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    moves.current++
  }, [pathname])
  useEffect(() => {
    const onPop = () => { moves.current = Math.max(0, moves.current - 1) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const goBack = () => {
    if (moves.current > 0 || window.history.length > 2) window.history.back()
    else router.push('/')
  }
  /*
   * 공유는 **앱 헤더 우측 상단**이 맡는다(2026-08-11 사용자 요청). 미니앱 안에 떠 있던
   * 버튼은 본문을 덮었고(AS 안내문 첫 줄이 실제로 가려져 자리를 비워 두고 있었다)
   * 화면마다 자리가 달라 눈이 헤맸다.
   *
   * 만들 것이 있을 때만 보인다 — 미니앱이 `share-state` 로 알려 준다. 띄워 두고 눌렀을 때
   * "공유할 내용이 없습니다"만 뜨면 고장으로 읽힌다(네 앱이 이미 지키던 규칙이다).
   */
  /*
   * 헤더에 **지금 이 기기가 어느 매장인지** 띄운다(2026-08-20). 점별 로그가 이 값으로
   * 쌓이므로 **틀린 채로 오래 가면 통계가 통째로 어긋난다** — 늘 보이는 자리에 두어
   * 눈으로 검산되게 한다(상태줄에 미배포 커밋 수를 띄운 것과 같은 이유다).
   * 누르면 다시 고를 수 있다.
   */
  const [store, setStore] = useState('')
  useEffect(() => {
    const read = () => setStore(getStoreCode())
    read()
    window.addEventListener('ax-store-changed', read)
    return () => window.removeEventListener('ax-store-changed', read)
  }, [])

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
        (item) => isActive(pathname, item.href)
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
        {pathname !== '/' && (
          <button
            type="button"
            onClick={goBack}
            aria-label="뒤로 가기"
            title="뒤로 가기"
            className="flex items-center justify-center rounded-full text-white mr-1.5 shrink-0"
            style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.18)' }}
          >
            <Icon name="back" size={17} />
          </button>
        )}
        <Link href="/" className="flex items-center gap-2 text-white no-underline">
          {/* 공식 워드마크 — 글꼴로 친 "SAMSUNG" 은 글자 모양이 달라 로고가 아니다 */}
          <SamsungWordmark height={17} />
          {/*
            **좁은 화면에서는 이름 배지를 숨긴다**(2026-08-28). 헤더가 워드마크+배지+지점+
            문의+공유로 빽빽해져 320·360px 에서 **공유 아이콘이 잘려 있었다** — 뒤로가기
            버튼이 들어오며 390px 까지 번졌다. 팀 이름·버전이 이미 같은 방식으로 물러선다.
            앱 이름은 허브 본문 h1 과 탭 제목이 계속 들고 있고, 미니앱은 바로 아래 자기
            헤더에 제 이름을 적으므로 **폰에서 이름을 잃지 않는다.**
            (재려면 `node .scratch/_hdrfit.mjs` — fixed 요소라 scrollWidth 로는 안 잡힌다)
          */}
          <span
            className="hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            세일즈 코파일럿
          </span>
        </Link>
        {/* 오른쪽 — 팀 이름은 왼쪽으로 밀고 그 자리에 공유 아이콘을 고정한다 */}
        <div className="flex items-center gap-2.5">
          {/* 버전 — 미니앱을 보고 있을 때도 최신인지 확인돼야 해서 상단바에 함께 둔다.
              좁은 화면에서는 팀 이름과 겹쳐 두 줄이 되므로 넓은 화면에서만 띄운다. */}
          <span className="hidden sm:inline text-white text-[10px] opacity-50 tracking-wide">
            {versionLabel()}
          </span>
          {/*
            **좁은 화면에서는 팀 이름을 숨긴다.** 문의 아이콘이 들어오면서 우측이
            워드마크+배지+팀이름+공유+문의로 빽빽해졌다 — 320px 기기에서 가로가 넘친다.
            이 앱은 "가로 스크롤 넘침 0건"을 기준으로 삼아 왔고, 버전 표시가 이미
            같은 방식으로 넓은 화면에서만 뜬다.
          */}
          {/* 지점 — 좁은 화면에서도 남긴다. 로그가 이 값으로 쌓이므로 팀 이름보다 중요하다 */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('ax-store-open'))}
            title="지점 바꾸기"
            /* 긴 이름(현대기아차연구소모바일 11자)이 320px 에서 공유 아이콘을 밀어냈다.
               **감추지 않고 줄인다** — 로그가 이 값으로 쌓이므로 사라지면 안 된다.
               눌러서 전체 이름을 볼 수 있다 */
            className="text-white text-[11px] font-semibold rounded-full px-2 py-0.5 truncate max-w-[74px] sm:max-w-none"
            style={{
              /* 테스트점은 **다른 색으로 표시한다** — 로그가 안 쌓이는 상태인데 평소와
                 똑같아 보이면, 점검이 끝난 뒤 되돌리는 것을 잊어 그 매장 통계가 통째로 빈다 */
              background: isTestStore(store) ? 'rgba(255,193,7,.9)' : 'rgba(255,255,255,0.18)',
              color: isTestStore(store) ? '#4a3200' : '#fff',
            }}
          >
            {store ? (isTestStore(store) ? '테스트점 · 로그 미기록' : storeName(store) || store) : '지점 선택'}
          </button>
          <span className="hidden lg:inline text-white text-xs opacity-60">경원영업팀</span>
          {/* 개발자 문의 — 떠 있던 버튼을 여기로 옮겼다(FeedbackButton 주석 참조) */}
          <FeedbackButton />
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
          const active = isActive(pathname, item.href)
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
                      const active = isActive(pathname, item.href)
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

          {/*
            최하단 두 칸. 그룹에 속하지 않는다.
            **개발중인 서비스가 위, 대시보드가 아래**다. 상담사가 쓸 일이 있는 쪽이 위에 온다.

            **개발중인 서비스에는 자물쇠를 붙이지 않는다**(2026-08-17 사용자 요청:
            *"이제 잠금을 해제했기 때문에 자물쇠 마크는 필요없습니다"*). 실제로 비밀번호를
            묻지 않는데 자물쇠가 그려져 있으면 **상담사가 들어가 보지도 않는다** — 화면이
            사실과 다른 말을 하는 셈이다. 대시보드는 여전히 잠기므로 그쪽에만 남는다.
          */}
          <div className="pt-2 border-t border-gray-100">
            <Link
              href={DEV_LINK.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium no-underline transition-all"
              style={{
                background: isActive(pathname, DEV_LINK.href) ? 'rgba(20, 40, 160, 0.08)' : 'transparent',
                color: isActive(pathname, DEV_LINK.href) ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontWeight: isActive(pathname, DEV_LINK.href) ? 700 : 500,
              }}
            >
              <Icon name={DEV_LINK.icon} size={19} />
              <span>{DEV_LINK.label}</span>
            </Link>
            <Link
              href={ADMIN_LINK.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium no-underline transition-all"
              style={{
                background: isActive(pathname, ADMIN_LINK.href) ? 'rgba(20, 40, 160, 0.08)' : 'transparent',
                color: isActive(pathname, ADMIN_LINK.href) ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontWeight: isActive(pathname, ADMIN_LINK.href) ? 700 : 500,
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
