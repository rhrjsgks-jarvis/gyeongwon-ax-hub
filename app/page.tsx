'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { logEvent, LogModule } from '@/lib/logEvent'
import Icon, { IconName } from '@/components/Icon'
import SearchTrends from '@/components/SearchTrends'
import QRCode from '@/components/QRCode'
import { APP_VERSION, versionLabel } from '@/lib/version'
import { DEV_MODULES } from '@/lib/devModules'
import { STORE_LIST, getStoreCode } from '@/lib/stores'

/*
 * 배포 주소. **`salescopilot.vercel.app` 은 쓸 수 없다** — 이미 다른 사람의 앱이 그 이름을
 * 쓰고 있다("Sales Copilot - Video Meeting"). 그래서 뒤에 `-store` 를 붙였다.
 * 화면에 적히는 주소도 이 상수에서 나온다 — 두 곳이 어긋난 적이 있다.
 * 프로젝트 이름을 바꾸면 여기만 고치면 된다.
 */
const HUB_URL = 'https://salescopilot-store.vercel.app'

type ModuleCard = {
  href: string
  icon: IconName
  title: string
  /* 옛 이름 — 제목 아래 작은 줄로 나온다. 없는 모듈은 그 줄이 아예 안 그려진다 */
  sub?: string
  desc: string
  color: string
  bg: string
  updated: string
  status: string
  external?: boolean
  logKey?: LogModule
}

const MODULE_GROUPS: { title: string; modules: ModuleCard[] }[] = [
  {
    title: '제품 상담 도구',
    modules: [
      {
        href: '/finder',
        icon: 'finder',
        title: '모델파인더',
        /* 옛 이름 — 제목 아래 작은 줄로 내린다(괄호로 한 줄에 붙이면 지저분하다) */
        sub: '제품 상세검색',
        desc: '예산·치수·기능 조건으로 좁히는 전문 검색 — CE·MX·리빙·Harman 전 제품(1,697종)',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.06',
        status: 'live',
      },
      {
        href: '/care',
        icon: 'care',
        title: 'AI구독 케어 안내',
        desc: '제품별 구독 기간·주기에 따라 받는 케어 서비스 안내',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.06',
        status: 'live',
      },
      {
        href: '/compare',
        icon: 'compare',
        title: '타사비교 세일즈가이드',
        desc: '모델 선택 또는 URL 입력으로 즉시 비교표 + 셀링포인트 + 응대 스크립트 생성',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.07',
        status: 'live',
      },
      {
        href: 'https://www.samsungstore.com/event/catalog.sesc?menu=w110',
        icon: 'catalog',
        title: '모바일 카탈로그',
        desc: '삼성스토어 제품 카탈로그를 모바일로 바로 열람',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.07',
        status: 'live',
        external: true,
        logKey: 'catalog',
      },
      {
        href: '/install',
        icon: 'install',
        title: '제품별 설치환경 가이드',
        desc: '카테고리별 설치 공간·전기/급배수 요건 즉시 확인',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.07',
        status: 'live',
      },
            {
        href: '/as',
        icon: 'warranty',
        title: 'AS 관련 정보',
        desc: '무상보증·핵심부품·부품보유기간 + AS·물류센터 연락처 + 빌트인 이전설치 관할까지 한 곳에서',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.08',
        status: 'live',
      },
      {
        href: '/install-cost',
        icon: 'bolt',
        title: '설치비용 · 사전준비',
        desc: '신규 설치 추가비 131행 + 이전·재설치·철거 304행 + 사다리차·야간/공휴일·거리 할증 + 설치 전 준비(멀티탭 16A·식기세척기 설치 불가 조건·에어컨 안전 안내)',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.08',
        status: 'live',
      },

    ],
  },
  {
    title: '교육',
    modules: [
      {
        href: '/test',
        icon: 'quiz',
        title: '레벨업 챌린지',
        desc: '2026 제품 전문가 역량 평가 · 25문항 · 30분',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.06',
        status: 'live',
      },
      {
        href: '/quiz',
        icon: 'target',
        title: 'URL 퀴즈 생성기',
        desc: '자사·경쟁사 URL 입력 → 직원 평가용 인터랙티브 퀴즈 즉시 생성',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.07',
        status: 'live',
      },
    ],
  },
  {
    title: '매장운영 도구',
    modules: [
      {
        href: '/poster',
        icon: 'qr',
        title: '컨시어지 접수 포스터',
        desc: '지점을 고르면 그 매장 접수 QR 이 만들어진다 — 지면 문구는 직접 고쳐 인쇄, 전 지점 일괄 출력도 된다',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.08',
        status: 'live',
      },
    ],
  },
  {
    // 아직 다듬는 중인 것. status 가 'live' 가 아니면 「구축중」 배지가 붙는다.
    // 목록은 `lib/devModules.ts` 한 곳에서만 적는다 — 사이드바의 '개발중인 서비스'가
    // 같은 것을 보여주므로, 두 곳에 적으면 어긋나고 어긋난 쪽을 본 상담사가 헤맨다.
    title: '개발 중',
    modules: DEV_MODULES as unknown as ModuleCard[],
  },
]

// 사용현황 대시보드는 그룹에 속하지 않고 허브 최하단에 별도 섹션으로 운영
const ADMIN_MODULE: ModuleCard = {
  href: '/admin',
  icon: 'dashboard',
  title: '사용현황 대시보드[관리자용]',
  desc: '모듈별 사용 현황 · 팀 AI 활용도 통계 · CSV 내보내기 (비밀번호 필요)',
  color: '#1428A0',
  bg: '#EEF2FF',
  updated: '2026.07',
  status: 'live',
}

const CONCIERGE_LINKS = [
  {
    href: 'https://script.google.com/macros/s/AKfycbzhQZIPSl8_bCnw4Sp0BRs2SkxWukAx5Eg0L3gE8U93e1SzvEsdoguGYIf4isur_SCZ/exec?s=ZN01',
    icon: 'ticket',
    label: '컨시어지 접수',
    desc: '성함·연락처로 대기접수 · 대기번호 발급',
  },
  {
    href: 'https://script.google.com/macros/s/AKfycbzhQZIPSl8_bCnw4Sp0BRs2SkxWukAx5Eg0L3gE8U93e1SzvEsdoguGYIf4isur_SCZ/exec?page=admin&s=ZN01',
    icon: 'ticket',
    label: '컨시어지 관리자',
    desc: '대기 호출 · 완료처리 (직원용)',
  },
  {
    href: 'https://script.google.com/macros/s/AKfycbzhQZIPSl8_bCnw4Sp0BRs2SkxWukAx5Eg0L3gE8U93e1SzvEsdoguGYIf4isur_SCZ/exec?page=board&s=ZN01',
    icon: 'display',
    label: '매장 전광판',
    desc: '대기 현황 실시간 안내판',
  },
]

/*
 * 매장별 확인하기 드롭다운 — 지점명을 고르면 컨시어지 접수/관리자/전광판 링크의 `s=`
 * 파라미터가 그 점코드로 바뀐다. 기본값은 이 기기가 고른 지점이고, 아직 안 골랐으면
 * 목록 첫 항목(스타필드 수원)이다.
 *
 * **목록은 `lib/stores.ts` 한 곳에 있다** — 첫 접속 지점 고르기·점별 로그가 같은 것을
 * 봐야 해서 옮겼다. 여기 다시 적으면 한쪽만 고쳤을 때 화면이 서로 다른 말을 한다.
 */

const CONCIERGE_USAGE = [
  { step: '1', text: '고객이 매장 방문 시 "컨시어지 접수"에서 성함·연락처를 입력해 대기 등록 → 대기번호가 발급됩니다.' },
  { step: '2', text: '"매장 전광판"을 매장 내 모니터·태블릿에 항상 띄워 두면 대기번호·순번이 고객에게 실시간으로 보입니다.' },
  { step: '3', text: '상담 가능해지면 담당 직원이 "컨시어지 관리자"에서 해당 대기번호를 호출·완료 처리합니다.' },
]

const COUPON_LINKS = [
  {
    href: 'https://script.google.com/macros/s/AKfycbzXMz57Vo-w15z_FOI2lg4iOMQBBoRW0p2JQIiB1kKXWs5cEKquVt_-Qug2r3MemA/exec',
    icon: 'coupon',
    label: '시크릿쿠폰',
    desc: '매장별 쿠폰 재고 · 발급현황 조회',
  },
]

/*
 * 섹션 앵커 — 좁은 화면 하단 바로가기의 '교육'·'매장운영'이 이 자리로 데려간다.
 * 그 둘은 페이지가 아니라 **분류**라 도구가 여럿이므로, 허브의 그 섹션을 펼쳐 보여주는 것이 맞다.
 * ANCHOR_SECTION 에도 함께 넣어야 모바일에서 접힌 섹션이 펼쳐진다.
 */
const SECTION_ID: Record<string, string> = {
  '제품 상담 도구': 'tools',
  '교육': 'edu',
  '매장운영 도구': 'store',
}

const TIPS = [
  { icon: 'compare' as IconName, situation: '고객이 타사 제품을 비교할 때', tool: '타사비교', href: '/compare' },
  { icon: 'care' as IconName, situation: 'AI구독 케어 항목을 안내할 때', tool: 'AI구독 케어 안내', href: '/care' },
  { icon: 'search' as IconName, situation: '무엇이든 빠르게 찾을 때', tool: '통합검색', href: '/search' },
  { icon: 'quiz' as IconName, situation: '팀 교육 퀴즈 자료를 만들 때', tool: 'URL 퀴즈 생성기', href: '/quiz' },
  { icon: 'install' as IconName, situation: '설치 가능 여부를 확인할 때', tool: '설치환경 가이드', href: '/install' },
]

const GUIDE = [
  { step: '01', text: '통합검색 — 조건을 띄어쓰기로 겹쳐 앱 안의 모든 자료를 한 번에' },
  { step: '02', text: 'AI구독 케어 — 제품별 케어 주기·항목 즉시 조회' },
  { step: '03', text: '타사비교 — URL 입력으로 비교표 자동 생성' },
  { step: '04', text: '사용현황 대시보드 — 내 사용 통계 확인 · CSV 내보내기' },
]

function StatusBadge({ status }: { status: string }) {
  if (status === 'live') {
    return (
      <span className="badge text-emerald-700 bg-emerald-50 border border-emerald-200">
        ✓ 운영중
      </span>
    )
  }
  return (
    <span className="badge text-amber-700 bg-amber-50 border border-amber-200">
      <Icon name="build" size={12} className="inline-block align-[-2px] mr-1" /> 구축중
    </span>
  )
}

function ModuleTile({ mod }: { mod: ModuleCard }) {
  const cardBody = (
    <div className="module-card group">
      <div className="flex items-start justify-between mb-2 md:mb-3 gap-1">
        <div
          className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center text-base md:text-xl shrink-0"
          style={{ background: mod.bg, color: mod.color }}
        >
          <Icon name={mod.icon} size={20} className="md:hidden" />
          <Icon name={mod.icon} size={24} className="hidden md:block" />
        </div>
        <StatusBadge status={mod.status} />
      </div>
      <h2 className="font-bold text-sm md:text-base mb-1 group-hover:text-[#1428A0] transition-colors leading-snug">
        {mod.title}{mod.external && <Icon name="external" size={12} className="inline-block align-[-1px] ml-1 text-gray-300" />}
      </h2>
      {/* 옛 이름이 있는 모듈만 한 줄 더 — 없는 모듈은 이 줄이 아예 안 그려진다 */}
      {mod.sub && <p className="text-[10px] md:text-[11px] text-gray-400 font-medium -mt-0.5 mb-1">{mod.sub}</p>}
      <p className="text-[11px] md:text-xs text-gray-500 leading-relaxed mb-2">{mod.desc}</p>
      <p className="text-[10px] text-gray-300 font-medium">DB {mod.updated} 기준</p>
    </div>
  )

  if (mod.external) {
    return (
      <a
        href={mod.href}
        target="_blank"
        rel="noopener noreferrer"
        className="no-underline"
        onClick={() => mod.logKey && logEvent(mod.logKey, 'page_view')}
      >
        {cardBody}
      </a>
    )
  }

  return (
    <Link href={mod.href} className="no-underline">
      {cardBody}
    </Link>
  )
}

function withStoreCode(href: string, code: string): string {
  const url = new URL(href)
  url.searchParams.set('s', code)
  return url.toString()
}

function LinkListCard({
  id, icon, title, subtitle, links, logKey, usage, note, stores,
}: {
  id: string
  /* 이모지가 아니라 아이콘 이름이다 — 허브와 도구가 같은 그림을 쓰게 한다 */
  icon: IconName
  title: string
  subtitle: string
  links: { href: string; icon: string; label: string; desc: string }[]
  logKey: LogModule
  usage?: { step: string; text: string }[]
  note?: string
  stores?: { code: string; name: string }[]
}) {
  // 기본값을 특정 지점(스타필드 수원)으로 두면 다른 매장 사용자가 선택 없이 눌렀을 때 남의
  // 매장 정보가 열리므로, 처음에는 빈 값으로 두고 지점 선택을 먼저 유도한다.
  const [storeCode, setStoreCode] = useState('')
  const storeReady = !stores || !!storeCode
  // 지점명 ㄱ~ㅎ 순 정렬 (영문·숫자로 시작하는 매장명은 한글 앞에 배치됨)
  const sortedStores = stores ? [...stores].sort((a, b) => a.name.localeCompare(b.name, 'ko')) : []

  return (
    <div id={id} className="bg-white rounded-2xl p-4 border border-gray-100 scroll-mt-20">
      <h3 className="font-bold text-sm text-gray-700 mb-0.5 flex items-center gap-1.5"><Icon name={icon} size={16} style={{ color: '#1428A0' }} /> {title}</h3>
      <p className="text-[10px] text-gray-300 font-medium mb-3">{subtitle}</p>
      {stores && stores.length > 0 && (
        <div className="mb-3 pb-3 border-b border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 mb-1.5 flex items-center gap-1"><Icon name="store" size={12} /> 매장별로 확인하기</p>
          <select
            value={storeCode}
            onChange={(e) => setStoreCode(e.target.value)}
            className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 ${
              storeCode ? 'border-gray-200 text-gray-700' : 'border-blue-300 text-blue-700 font-semibold'
            }`}
          >
            <option value="">지점명 선택하기</option>
            {sortedStores.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        {links.map((l) => (
          <a
            key={l.href}
            href={stores ? (storeCode ? withStoreCode(l.href, storeCode) : undefined) : l.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`no-underline ${storeReady ? '' : 'pointer-events-none opacity-40'}`}
            aria-disabled={!storeReady}
            onClick={() => logEvent(logKey, 'page_view')}
          >
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors">
              <span className="text-base flex-shrink-0">{l.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{l.label}</p>
                <p className="text-xs text-gray-400">{l.desc}</p>
              </div>
              <Icon name="external" size={12} className="text-gray-300" />
            </div>
          </a>
        ))}
        {!storeReady && (
          <p className="text-[11px] text-blue-600 px-3 pt-1">
            위에서 지점명을 먼저 선택하면 해당 매장 정보로 연결됩니다.
          </p>
        )}
      </div>
      {usage && usage.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 mb-1.5 flex items-center gap-1"><Icon name="book" size={12} /> 사용 방법</p>
          <div className="flex flex-col gap-1">
            {usage.map((u) => (
              <div key={u.step} className="flex items-start gap-2">
                <span
                  className="shrink-0 mt-0.5 text-[9px] font-bold text-white rounded-full w-4 h-4 flex items-center justify-center"
                  style={{ background: '#1428A0' }}
                >
                  {u.step}
                </span>
                <p className="text-xs text-gray-500 leading-relaxed">{u.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {note && (
        <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: '#EFF6FF' }}>
          <p className="text-xs text-blue-700 leading-relaxed flex items-start gap-1.5"><Icon name="bulb" size={13} className="flex-shrink-0 mt-0.5" /> <span>{note}</span></p>
        </div>
      )}
    </div>
  )
}

function AccordionHeader({
  title, isOpen, onClick,
}: {
  title: string
  isOpen: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between mb-2 px-1 text-left"
    >
      <h3 className="font-bold text-sm text-gray-700">{title}</h3>
      <span
        className="text-[10px] text-gray-400 transition-transform md:hidden"
        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
      >
        ▼
      </span>
    </button>
  )
}

export default function Home() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  // 모바일에서는 클릭해야 펼쳐지는 아코디언, md 이상(데스크탑)에서는 항상 펼침 — 기본은 전부 접힘
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // 허브 메인 페이지뷰는 더 이상 기록하지 않는다 — 모든 모듈의 진입점이라
  // 링크를 타고 들어오거나 카드를 누르기만 해도 조회수가 쌓여 집계를 왜곡했다.
  // 통합검색(hub/search)·건의(hub/feedback)는 의도적인 행동이라 그대로 기록한다.

  // 통합검색에서 /#coupon · /#concierge 같은 앵커로 들어오는 경로 처리.
  // 모바일은 섹션이 접힌 채로 시작해 대상 요소가 hidden이라 브라우저가 스크롤 대상으로 잡지
  // 못하고, 클릭해도 아무 일이 없는 것처럼 보인다. 앵커가 속한 섹션을 먼저 펼친 뒤 스크롤한다.
  // (Next 클라이언트 네비게이션에서는 해시가 있어도 브라우저 기본 스크롤이 일어나지 않는
  //  경우가 있어 직접 scrollIntoView를 호출한다)
  const ANCHOR_SECTION: Record<string, string> = {
    coupon: '매장운영 도구',
    concierge: '매장운영 도구',
    tools: '제품 상담 도구',
    edu: '교육',
    store: '매장운영 도구',
  }
  /*
   * **해시가 바뀔 때마다** 그 섹션을 펼치고 그 자리로 데려간다.
   *
   * 예전에는 마운트될 때 한 번만 봤다. 그런데 하단 바로가기의 분류 탭('제품 상담 도구' ·
   * '교육' · '매장운영')은 **허브에 있는 상태에서 누르면 주소의 해시만 바뀐다** — 화면을
   * 새로 띄우지 않으므로 그 한 번이 다시 오지 않는다. 실측으로 눌러도 **섹션이 접힌 채
   * 그대로**였다(2026-08-11). 하단 탭이 하는 일이 바로 이것이라 그러면 탭이 아무 일도
   * 안 하는 셈이다. `hashchange` 를 함께 듣는다.
   */
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    function openFromHash() {
      const id = window.location.hash.slice(1)
      if (!id) return
      const section = ANCHOR_SECTION[id]
      if (section) setOpenSections((prev) => (prev[section] ? prev : { ...prev, [section]: true }))
      // 섹션이 펼쳐져 레이아웃이 잡힌 다음 프레임에 스크롤
      clearTimeout(t)
      t = setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => { clearTimeout(t); window.removeEventListener('hashchange', openFromHash) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCopy() {
    navigator.clipboard.writeText(HUB_URL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  /*
   * 날짜는 **하이드레이션이 끝난 뒤에** 채운다.
   *
   * 서버에서 그린 날짜와 브라우저가 하이드레이션할 때의 날짜가 다르면 React 가
   * hydration mismatch(#418·#425)를 내고 화면이 통째로 다시 그려진다. 이 페이지는 빌드
   * 시점에 미리 그려지므로, 빌드와 접속 사이에 날이 바뀌면 반드시 어긋난다 —
   * 실제로 CI 가 00:00 UTC 를 넘기며 돌다가 이 오류로 실패했다. 매장에서도 자정을 넘겨
   * 열어 두면 어제 날짜가 남는다.
   *
   * 첫 렌더에는 비워 두고(서버와 같은 결과) useEffect 에서 채운다. 자리를 미리 잡아 두어
   * 글자가 나타날 때 아래 내용이 밀리지 않게 한다.
   */
  const [todayStr, setTodayStr] = useState('')
  useEffect(() => {
    setTodayStr(new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    }))
  }, [])

  /* 본문 폭 — 넓은 화면에서 768px(max-w-3xl)에 묶여 좌우가 통째로 비어 있었다.
   * 단계적으로 넓히되 한 줄이 너무 길어져 읽기 어려워지지 않게 6xl 에서 멈춘다. */
  return (
    <div className="max-w-3xl xl:max-w-5xl 2xl:max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-1 min-h-4">{todayStr}</p>
        <h1 className="text-2xl font-black text-gray-900 flex items-baseline gap-2">
          세일즈 코파일럿
          {/*
            버전 — 매장 기기는 서비스워커가 캐시를 들고 있어 "배포했는데 화면이 그대로"가
            실제로 여러 번 있었다. 여기 숫자가 방금 올린 판과 같으면 반영된 것이다.
            이름을 이겨서는 안 되므로 작고 흐리게 둔다(심플 이즈 베스트).
          */}
          <span
            className="text-[11px] font-semibold text-gray-400 tracking-wide"
            title={`화면에 뜬 판이 최신인지 확인용 — 서비스워커 캐시 ${APP_VERSION}`}
          >
            {versionLabel()}
          </span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">매장 상담의 모든 답을 한 곳에</p>
      </div>

      {/* 통합검색 — 제품·카테고리·기능을 한 번에 찾아 해당 모듈로 연결한다 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const v = query.trim()
          if (v) router.push(`/search?q=${encodeURIComponent(v)}`)
        }}
        className="flex gap-2 mb-6"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="통합검색 — 제품명·모델코드·기능 (예: 무풍, 김치냉장고, RM90H91B1W)"
          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-blue-400"
        />
        <button
          type="submit"
          className="px-4 md:px-5 rounded-xl text-sm font-bold text-white shrink-0"
          style={{ background: '#1428A0' }}
        >
          검색
        </button>
      </form>

      {/* 지금 팀이 많이 찾는 것 — 검색어·도구 순위(2026-08-28 사장님 요청).
          자료가 없거나 얇으면 스스로 안 그린다. */}
      <SearchTrends />

      {/* 모듈 그리드 (섹션별) — 모바일: 클릭해야 펼쳐지는 아코디언 / 데스크탑: 항상 펼침 */}
      {MODULE_GROUPS.map((group) => {
        const isOpen = !!openSections[group.title]
        return (
          <div key={group.title} id={SECTION_ID[group.title]} className="mb-5 scroll-mt-20">
            <AccordionHeader title={group.title} isOpen={isOpen} onClick={() => toggleSection(group.title)} />
            <div className={`${isOpen ? 'grid' : 'hidden'} md:grid grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-3`}>
              {group.modules.map((mod) => (
                <ModuleTile key={mod.href} mod={mod} />
              ))}
            </div>
            {group.title === '매장운영 도구' && (
              <div className={`${isOpen ? 'flex' : 'hidden'} md:flex flex-col gap-3 mt-3`}>
                <LinkListCard
                  id="coupon"
                  icon="coupon"
                  title="쿠폰 배포 프로그램"
                  subtitle="매장 쿠폰 재고·발급현황 관리"
                  links={COUPON_LINKS}
                  logKey="coupon"
                />
                <LinkListCard
                  id="concierge"
                  icon="ticket"
                  title="컨시어지 프로그램"
                  subtitle="스타필드 수원 매장 대기접수 시스템"
                  links={CONCIERGE_LINKS}
                  logKey="concierge"
                  usage={CONCIERGE_USAGE}
                  note="고건한 프로에게 연락 주시면 우리 매장에도 동일하게 적용 가능합니다."
                  stores={STORE_LIST}
                />
              </div>
            )}
          </div>
        )
      })}

      {/* 사용현황 대시보드 — 그룹에 속하지 않고 최하단에 별도 운영 */}
      <div className="mb-5">
        <AccordionHeader
          title="사용현황 대시보드[관리자용]"
          isOpen={!!openSections['admin']}
          onClick={() => toggleSection('admin')}
        />
        <div className={`${openSections['admin'] ? 'grid' : 'hidden'} md:grid grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-3`}>
          <ModuleTile mod={ADMIN_MODULE} />
        </div>
      </div>

      {/* 상황별 도구 추천 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
        <AccordionHeader
          title="상황별 도구 추천"
          isOpen={!!openSections['tips']}
          onClick={() => toggleSection('tips')}
        />
        <div className={`${openSections['tips'] ? 'flex' : 'hidden'} md:flex flex-col gap-1`}>
          {TIPS.map((tip, i) => (
            <Link key={i} href={tip.href} className="no-underline">
              <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors">
                <Icon name={tip.icon} size={16} className="flex-shrink-0" style={{ color: '#1428A0' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">{tip.situation}</p>
                  <p className="text-sm font-semibold" style={{ color: '#1428A0' }}>→ {tip.tool}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 팀 공유 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
        <AccordionHeader
          title="팀에 공유하기"
          isOpen={!!openSections['qr']}
          onClick={() => toggleSection('qr')}
        />
        <div className={`${openSections['qr'] ? 'flex' : 'hidden'} md:flex gap-4 items-center`}>
          <QRCode
            text={HUB_URL}
            className="w-[88px] h-[88px] rounded-xl border border-gray-100 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-0.5">경원영업팀 세일즈 코파일럿</p>
            <p className="text-xs font-semibold text-gray-700 mb-3 truncate">{HUB_URL.replace('https://', '')}</p>
            <button
              onClick={handleCopy}
              className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ background: copied ? '#059669' : '#1428A0' }}
            >
              {copied ? <span className="inline-flex items-center gap-1"><Icon name="check" size={14} /> 복사됨!</span> : <span className="inline-flex items-center gap-1"><Icon name="link" size={14} /> 링크 복사</span>}
            </button>
          </div>
        </div>
      </div>

      {/* 빠른 시작 가이드 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
        <AccordionHeader
          title="처음이라면 — 4가지 도구"
          isOpen={!!openSections['guide']}
          onClick={() => toggleSection('guide')}
        />
        <div className={`${openSections['guide'] ? 'flex' : 'hidden'} md:flex flex-col gap-2`}>
          {GUIDE.map((g) => (
            <div key={g.step} className="flex items-start gap-3">
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                style={{ background: '#1428A0' }}
              >
                {g.step}
              </span>
              <p className="text-xs text-gray-600 leading-relaxed pt-0.5">{g.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
