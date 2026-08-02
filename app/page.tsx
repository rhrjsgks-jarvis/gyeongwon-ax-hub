'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { logEvent, LogModule } from '@/lib/logEvent'

const HUB_URL = 'https://gyeongwon-ax-hub.vercel.app'

type ModuleCard = {
  href: string
  icon: string
  title: string
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
    title: '🔍 제품 상담 도구',
    modules: [
      {
        href: '/finder',
        icon: '🔍',
        title: '모델파인더',
        desc: '키워드 한 줄로 CE·MX·리빙·Harman 전 제품(428종) 검색',
        color: '#1428A0',
        bg: '#EEF2FF',
        updated: '2026.06',
        status: 'live',
      },
      {
        href: '/care',
        icon: '💚',
        title: 'AI Care 검색기',
        desc: '구독케어 서비스 항목·조건 즉시 조회',
        color: '#059669',
        bg: '#ECFDF5',
        updated: '2026.06',
        status: 'live',
      },
      {
        href: '/compare',
        icon: '🔗',
        title: '타사비교',
        desc: '모델 선택 또는 URL 입력으로 즉시 비교표 + 셀링포인트 + 응대 스크립트 생성',
        color: '#EA580C',
        bg: '#FFF7ED',
        updated: '2026.07',
        status: 'live',
      },
      {
        href: 'https://www.samsungstore.com/event/catalog.sesc?menu=w110',
        icon: '📱',
        title: '모바일 카탈로그',
        desc: '삼성스토어 제품 카탈로그를 모바일로 바로 열람',
        color: '#0EA5E9',
        bg: '#F0F9FF',
        updated: '2026.07',
        status: 'live',
        external: true,
        logKey: 'catalog',
      },
      {
        href: '/install',
        icon: '🛠️',
        title: '설치환경 가이드',
        desc: '카테고리별 설치 공간·전기/급배수 요건 즉시 확인',
        color: '#B45309',
        bg: '#FFFBEB',
        updated: '2026.07',
        status: 'live',
      },
    ],
  },
  {
    title: '📚 교육',
    modules: [
      {
        href: '/test',
        icon: '📝',
        title: '레벨업테스트',
        desc: '2026 제품 전문가 역량 평가 · 25문항 · 30분',
        color: '#7C3AED',
        bg: '#F5F3FF',
        updated: '2026.06',
        status: 'live',
      },
      {
        href: '/quiz',
        icon: '🎯',
        title: 'URL 퀴즈 생성',
        desc: '자사·경쟁사 URL 입력 → 직원 평가용 인터랙티브 퀴즈 즉시 생성',
        color: '#0891B2',
        bg: '#ECFEFF',
        updated: '2026.07',
        status: 'live',
      },
    ],
  },
  {
    title: '🏬 매장운영 도구',
    modules: [],
  },
]

// AX 현황 대시보드는 그룹에 속하지 않고 허브 최하단에 별도 섹션으로 운영
const ADMIN_MODULE: ModuleCard = {
  href: '/admin',
  icon: '📊',
  title: 'AX 현황 대시보드',
  desc: '모듈별 사용 현황 · 팀 AI 활용도 통계 · CSV 내보내기',
  color: '#475569',
  bg: '#F8FAFC',
  updated: '2026.07',
  status: 'live',
}

const CONCIERGE_LINKS = [
  {
    href: 'https://script.google.com/macros/s/AKfycbzhQZIPSl8_bCnw4Sp0BRs2SkxWukAx5Eg0L3gE8U93e1SzvEsdoguGYIf4isur_SCZ/exec?s=ZN01',
    icon: '🎫',
    label: '컨시어지 접수',
    desc: '성함·연락처로 대기접수 · 대기번호 발급',
  },
  {
    href: 'https://script.google.com/macros/s/AKfycbzhQZIPSl8_bCnw4Sp0BRs2SkxWukAx5Eg0L3gE8U93e1SzvEsdoguGYIf4isur_SCZ/exec?page=admin&s=ZN01',
    icon: '📟',
    label: '컨시어지 관리자',
    desc: '대기 호출 · 완료처리 (직원용)',
  },
  {
    href: 'https://script.google.com/macros/s/AKfycbzhQZIPSl8_bCnw4Sp0BRs2SkxWukAx5Eg0L3gE8U93e1SzvEsdoguGYIf4isur_SCZ/exec?page=board&s=ZN01',
    icon: '📺',
    label: '매장 전광판',
    desc: '대기 현황 실시간 안내판',
  },
]

// 매장별 확인하기 드롭다운 — 지점명 선택 시 컨시어지 접수/관리자/전광판 링크의 s= 파라미터가
// 해당 지점코드로 자동 치환된다. 기본값(첫 항목)은 이 허브가 실제 운영 중인 스타필드 수원(ZN01).
const STORE_LIST = [
  { code: 'ZN01', name: '스타필드 수원' },
  { code: 'ZHA7', name: '현대판교모바일' },
  { code: 'Z279', name: '오산' },
  { code: 'Z047', name: '수지' },
  { code: 'Z150', name: '강릉옥천' },
  { code: 'Z205', name: '단구' },
  { code: 'Z206', name: '석사' },
  { code: 'Z227', name: '속초' },
  { code: 'Z243', name: '평택' },
  { code: 'Z324', name: '분당' },
  { code: 'Z343', name: '북수원' },
  { code: 'Z378', name: '광주' },
  { code: 'Z383', name: '안성' },
  { code: 'Z398', name: '평택고덕' },
  { code: 'Z399', name: '이천증포' },
  { code: 'Z405', name: '평촌' },
  { code: 'Z418', name: '안양모바일' },
  { code: 'Z426', name: '용인구성' },
  { code: 'Z451', name: '서수원' },
  { code: 'Z509', name: '영통' },
  { code: 'Z539', name: '디지털시티모바일' },
  { code: 'Z541', name: '광명소하' },
  { code: 'Z557', name: '성남' },
  { code: 'Z567', name: 'AK분당' },
  { code: 'Z579', name: '원주' },
  { code: 'Z583', name: '춘천' },
  { code: 'Z586', name: '평택세교' },
  { code: 'Z607', name: '용인처인모바일' },
  { code: 'Z608', name: '권선' },
  { code: 'Z617', name: '안양본' },
  { code: 'Z619', name: '수원' },
  { code: 'Z621', name: '동탄' },
  { code: 'Z624', name: '강릉' },
  { code: 'Z640', name: '단계' },
  { code: 'Z663', name: '하남미사' },
  { code: 'Z666', name: '용인기흥' },
  { code: 'ZH35', name: '롯데평촌' },
  { code: 'ZH36', name: '롯데수원' },
  { code: 'ZH57', name: '현대판교' },
  { code: 'ZH64', name: '신세계사우스시티' },
  { code: 'ZH73', name: 'AK수원' },
  { code: 'ZH74', name: 'AK평택' },
  { code: 'ZH75', name: 'AK원주' },
  { code: 'ZH77', name: '신세계하남' },
  { code: 'ZH96', name: '갤러리아광교' },
  { code: 'ZH97', name: 'AK분당모바일' },
  { code: 'ZHA1', name: '롯데동탄' },
  { code: 'ZHA2', name: '롯데동탄모바일' },
  { code: 'ZHB4', name: '타임빌라스수원' },
  { code: 'ZIN5', name: '남양모바일' },
  { code: 'ZMF6', name: '이마트안양' },
  { code: 'ZR42', name: '기흥캠퍼스모바일' },
  { code: 'ZR60', name: '화성캠퍼스모바일' },
  { code: 'ZR65', name: '수원삼성전기모바일' },
  { code: 'ZR78', name: '광명기아자동차모바일' },
  { code: 'ZRA0', name: '화성DSR모바일' },
  { code: 'ZRD0', name: '미래기술캠퍼스모바일' },
  { code: 'ZRD2', name: '디지털시티2모바일' },
  { code: 'ZRE0', name: '용인에버랜드모바일' },
  { code: 'ZRE4', name: '평택캠퍼스모바일' },
  { code: 'ZRE6', name: '기흥삼성SDI모바일' },
  { code: 'ZRF7', name: '현대기아차연구소모바일' },
  { code: 'ZRF8', name: '판교SDS모바일' },
  { code: 'ZRF9', name: '기흥SDR모바일' },
  { code: 'ZRG1', name: 'KGM평택모바일' },
]

const CONCIERGE_USAGE = [
  { step: '1', text: '고객이 매장 방문 시 "컨시어지 접수"에서 성함·연락처를 입력해 대기 등록 → 대기번호가 발급됩니다.' },
  { step: '2', text: '"매장 전광판"을 매장 내 모니터·태블릿에 항상 띄워두면 대기번호·순번이 고객에게 실시간으로 보입니다.' },
  { step: '3', text: '상담 가능해지면 담당 직원이 "컨시어지 관리자"에서 해당 대기번호를 호출·완료 처리합니다.' },
]

const COUPON_LINKS = [
  {
    href: 'https://script.google.com/macros/s/AKfycbzXMz57Vo-w15z_FOI2lg4iOMQBBoRW0p2JQIiB1kKXWs5cEKquVt_-Qug2r3MemA/exec',
    icon: '🎁',
    label: '시크릿쿠폰',
    desc: '매장별 쿠폰 재고 · 발급현황 조회',
  },
]

const TIPS = [
  { emoji: '🛒', situation: '고객이 타사 제품을 비교할 때', tool: '타사비교', href: '/compare' },
  { emoji: '📋', situation: '케어십 서비스 항목을 안내할 때', tool: 'AI Care 검색기', href: '/care' },
  { emoji: '🔎', situation: '제품 스펙을 빠르게 확인할 때', tool: '모델파인더', href: '/finder' },
  { emoji: '🎓', situation: '팀 교육 퀴즈 자료를 만들 때', tool: 'URL 퀴즈 생성', href: '/quiz' },
  { emoji: '🛠️', situation: '설치 가능 여부를 확인할 때', tool: '설치환경 가이드', href: '/install' },
]

const GUIDE = [
  { step: '01', text: '모델파인더 — 키워드 한 줄로 CE·MX·Harman 전 제품 검색' },
  { step: '02', text: 'AI Care — 구독케어 조건·항목 즉시 조회' },
  { step: '03', text: '타사비교 — URL 입력으로 비교표 자동 생성' },
  { step: '04', text: 'AX 대시보드 — 내 사용 통계 확인 · CSV 내보내기' },
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
      🔧 구축중
    </span>
  )
}

function ModuleTile({ mod }: { mod: ModuleCard }) {
  const cardBody = (
    <div className="module-card group">
      <div className="flex items-start justify-between mb-2 md:mb-3 gap-1">
        <div
          className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center text-base md:text-xl shrink-0"
          style={{ background: mod.bg }}
        >
          {mod.icon}
        </div>
        <StatusBadge status={mod.status} />
      </div>
      <h2 className="font-bold text-sm md:text-base mb-1 group-hover:text-[#1428A0] transition-colors leading-snug">
        {mod.title}{mod.external && <span className="text-gray-300 text-xs font-normal"> ↗</span>}
      </h2>
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
  icon: string
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
      <h3 className="font-bold text-sm text-gray-700 mb-0.5">{icon} {title}</h3>
      <p className="text-[10px] text-gray-300 font-medium mb-3">{subtitle}</p>
      {stores && stores.length > 0 && (
        <div className="mb-3 pb-3 border-b border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 mb-1.5">🏬 매장별로 확인하기</p>
          <select
            value={storeCode}
            onChange={(e) => setStoreCode(e.target.value)}
            className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 ${
              storeCode ? 'border-gray-200 text-gray-700' : 'border-blue-300 text-blue-700 font-semibold'
            }`}
          >
            <option value="">👆 지점명 선택하기</option>
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
              <span className="text-gray-300 text-xs">↗</span>
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
          <p className="text-[10px] font-bold text-gray-400 mb-1.5">📖 사용 방법</p>
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
          <p className="text-xs text-blue-700 leading-relaxed">💡 {note}</p>
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

  useEffect(() => { logEvent('hub', 'page_view') }, [])

  // 통합검색에서 /#coupon · /#concierge 같은 앵커로 들어오는 경로 처리.
  // 모바일은 섹션이 접힌 채로 시작해 대상 요소가 hidden이라 브라우저가 스크롤 대상으로 잡지
  // 못하고, 클릭해도 아무 일이 없는 것처럼 보인다. 앵커가 속한 섹션을 먼저 펼친 뒤 스크롤한다.
  // (Next 클라이언트 네비게이션에서는 해시가 있어도 브라우저 기본 스크롤이 일어나지 않는
  //  경우가 있어 직접 scrollIntoView를 호출한다)
  const ANCHOR_SECTION: Record<string, string> = {
    coupon: '🏬 매장운영 도구',
    concierge: '🏬 매장운영 도구',
  }
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    const section = ANCHOR_SECTION[id]
    if (section) setOpenSections((prev) => (prev[section] ? prev : { ...prev, [section]: true }))
    // 섹션이 펼쳐져 레이아웃이 잡힌 다음 프레임에 스크롤
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCopy() {
    navigator.clipboard.writeText(HUB_URL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const todayStr = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <div className="max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-1">{todayStr}</p>
        <h1 className="text-2xl font-black text-gray-900">경원 AX 허브</h1>
        <p className="text-sm text-gray-500 mt-1">영업지원 AI 도구 통합 플랫폼</p>
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
          placeholder="🔎 통합검색 — 제품명·모델코드·기능 (예: 무풍, 김치냉장고, RM90H91B1W)"
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

      {/* 모듈 그리드 (섹션별) — 모바일: 클릭해야 펼쳐지는 아코디언 / 데스크탑: 항상 펼침 */}
      {MODULE_GROUPS.map((group) => {
        const isOpen = !!openSections[group.title]
        return (
          <div key={group.title} className="mb-5">
            <AccordionHeader title={group.title} isOpen={isOpen} onClick={() => toggleSection(group.title)} />
            <div className={`${isOpen ? 'grid' : 'hidden'} md:grid grid-cols-2 gap-2.5 md:gap-3`}>
              {group.modules.map((mod) => (
                <ModuleTile key={mod.href} mod={mod} />
              ))}
            </div>
            {group.title === '🏬 매장운영 도구' && (
              <div className={`${isOpen ? 'flex' : 'hidden'} md:flex flex-col gap-3 mt-3`}>
                <LinkListCard
                  id="coupon"
                  icon="🎁"
                  title="쿠폰 배포프로그램"
                  subtitle="매장 쿠폰 재고·발급현황 관리"
                  links={COUPON_LINKS}
                  logKey="coupon"
                />
                <LinkListCard
                  id="concierge"
                  icon="🎫"
                  title="컨시어지 프로그램"
                  subtitle="스타필드 수원 매장 대기접수 시스템"
                  links={CONCIERGE_LINKS}
                  logKey="concierge"
                  usage={CONCIERGE_USAGE}
                  note="고건한 프로에게 연락주시면 우리 매장에도 동일하게 적용 가능합니다."
                  stores={STORE_LIST}
                />
              </div>
            )}
          </div>
        )
      })}

      {/* AX 현황 대시보드 — 그룹에 속하지 않고 최하단에 별도 운영 */}
      <div className="mb-5">
        <AccordionHeader
          title="📊 AX 현황 대시보드"
          isOpen={!!openSections['admin']}
          onClick={() => toggleSection('admin')}
        />
        <div className={`${openSections['admin'] ? 'grid' : 'hidden'} md:grid grid-cols-2 gap-2.5 md:gap-3`}>
          <ModuleTile mod={ADMIN_MODULE} />
        </div>
      </div>

      {/* 상황별 도구 추천 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
        <AccordionHeader
          title="💡 상황별 도구 추천"
          isOpen={!!openSections['tips']}
          onClick={() => toggleSection('tips')}
        />
        <div className={`${openSections['tips'] ? 'flex' : 'hidden'} md:flex flex-col gap-1`}>
          {TIPS.map((tip, i) => (
            <Link key={i} href={tip.href} className="no-underline">
              <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors">
                <span className="text-base flex-shrink-0">{tip.emoji}</span>
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
          title="📤 팀에 공유하기"
          isOpen={!!openSections['qr']}
          onClick={() => toggleSection('qr')}
        />
        <div className={`${openSections['qr'] ? 'flex' : 'hidden'} md:flex gap-4 items-center`}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(HUB_URL)}`}
            alt="QR코드"
            className="w-[88px] h-[88px] rounded-xl border border-gray-100 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-0.5">경원영업팀 전용 AI 허브</p>
            <p className="text-xs font-semibold text-gray-700 mb-3 truncate">gyeongwon-ax-hub.vercel.app</p>
            <button
              onClick={handleCopy}
              className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ background: copied ? '#059669' : '#1428A0' }}
            >
              {copied ? '✓ 복사됨!' : '🔗 링크 복사'}
            </button>
          </div>
        </div>
      </div>

      {/* 빠른 시작 가이드 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
        <AccordionHeader
          title="🚀 처음이라면 — 4가지 도구"
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
