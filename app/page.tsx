'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { logEvent, LogModule } from '@/lib/logEvent'

const PROJECT_START = new Date('2026-06-30')
const TOTAL_DAYS = 30
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
        desc: '키워드 한 줄로 CE·MX·Harman 전 제품(297종) 검색',
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
        desc: 'URL 입력으로 즉시 비교표 + 셀링포인트 + 응대 스크립트 생성',
        color: '#EA580C',
        bg: '#FFF7ED',
        updated: '2026.07',
        status: 'live',
      },
      {
        href: '/compare-instant',
        icon: '⚡',
        title: '즉시비교 (개선중)',
        desc: '카테고리·모델 드롭다운 선택형 즉시비교 — UX 개선 진행중',
        color: '#B45309',
        bg: '#FFFBEB',
        updated: '2026.07',
        status: 'beta',
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
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: mod.bg }}
        >
          {mod.icon}
        </div>
        <StatusBadge status={mod.status} />
      </div>
      <h2 className="font-bold text-base mb-1 group-hover:text-[#1428A0] transition-colors">
        {mod.title}{mod.external && <span className="text-gray-300 text-xs font-normal"> ↗</span>}
      </h2>
      <p className="text-xs text-gray-500 leading-relaxed mb-2">{mod.desc}</p>
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

function LinkListCard({
  id, icon, title, subtitle, links, logKey,
}: {
  id: string
  icon: string
  title: string
  subtitle: string
  links: { href: string; icon: string; label: string; desc: string }[]
  logKey: LogModule
}) {
  return (
    <div id={id} className="bg-white rounded-2xl p-4 border border-gray-100 scroll-mt-20">
      <h3 className="font-bold text-sm text-gray-700 mb-0.5">{icon} {title}</h3>
      <p className="text-[10px] text-gray-300 font-medium mb-3">{subtitle}</p>
      <div className="flex flex-col gap-1">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline"
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
      </div>
    </div>
  )
}

export default function Home() {
  const [copied, setCopied] = useState(false)

  useEffect(() => { logEvent('hub', 'page_view') }, [])

  function handleCopy() {
    navigator.clipboard.writeText(HUB_URL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const today = new Date()
  const dayNum = Math.max(1, Math.floor((today.getTime() - PROJECT_START.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  const clampedDay = Math.min(dayNum, TOTAL_DAYS)
  const progress = (clampedDay / TOTAL_DAYS) * 100

  const todayStr = today.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  const weeks = [
    { label: '1주차', desc: '기반 구축',    active: clampedDay <= 7 },
    { label: '2주차', desc: '콘텐츠 고도화', active: clampedDay > 7  && clampedDay <= 14 },
    { label: '3주차', desc: '실사용 검증',  active: clampedDay > 14 && clampedDay <= 21 },
    { label: '4주차', desc: '완성·발표',    active: clampedDay > 21 },
  ]

  return (
    <div className="max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 mb-1">{todayStr}</p>
        <h1 className="text-2xl font-black text-gray-900">경원 AX 허브</h1>
        <p className="text-sm text-gray-500 mt-1">영업지원 AI 도구 통합 플랫폼</p>
      </div>

      {/* 공지 배너 */}
      <div
        className="rounded-2xl p-4 mb-6 text-white text-sm"
        style={{ background: 'linear-gradient(135deg, #1428A0, #2563EB)' }}
      >
        <div className="flex items-start gap-3">
          <span className="text-xl">🚀</span>
          <div>
            <p className="font-bold mb-0.5">AX 허브 구축 30일 플랜 · Day {clampedDay}</p>
            <p className="opacity-80 text-xs">
              4개 AI 영업지원 도구 운영 중 · 매일 업데이트 예정
            </p>
          </div>
        </div>
      </div>

      {/* 모듈 그리드 (섹션별) */}
      {MODULE_GROUPS.map((group) => (
        <div key={group.title} className="mb-5">
          <h3 className="font-bold text-sm text-gray-700 mb-2 px-1">{group.title}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.modules.map((mod) => (
              <ModuleTile key={mod.href} mod={mod} />
            ))}
          </div>
          {group.title === '🏬 매장운영 도구' && (
            <div className="flex flex-col gap-3 mt-3">
              <LinkListCard
                id="concierge"
                icon="🎫"
                title="컨시어지 프로그램"
                subtitle="스타필드 수원 매장 대기접수 시스템"
                links={CONCIERGE_LINKS}
                logKey="concierge"
              />
              <LinkListCard
                id="coupon"
                icon="🎁"
                title="쿠폰 배포프로그램"
                subtitle="매장 쿠폰 재고·발급현황 관리"
                links={COUPON_LINKS}
                logKey="coupon"
              />
            </div>
          )}
        </div>
      ))}

      {/* AX 현황 대시보드 — 그룹에 속하지 않고 최하단에 별도 운영 */}
      <div className="mb-5">
        <h3 className="font-bold text-sm text-gray-700 mb-2 px-1">📊 AX 현황 대시보드</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ModuleTile mod={ADMIN_MODULE} />
        </div>
      </div>

      {/* 상황별 도구 추천 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
        <h3 className="font-bold text-sm text-gray-700 mb-3">💡 상황별 도구 추천</h3>
        <div className="flex flex-col gap-1">
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
        <h3 className="font-bold text-sm text-gray-700 mb-3">📤 팀에 공유하기</h3>
        <div className="flex gap-4 items-center">
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
        <h3 className="font-bold text-sm text-gray-700 mb-3">🚀 처음이라면 — 4가지 도구</h3>
        <div className="flex flex-col gap-2">
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

      {/* 진행 현황 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-gray-700 mb-3">📅 30일 실행 현황</h3>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${progress}%`, background: 'var(--color-primary)' }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-500">Day {clampedDay} / {TOTAL_DAYS}</span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center mt-3">
          {weeks.map((w) => (
            <div
              key={w.label}
              className="rounded-xl py-2 px-1"
              style={{
                background: w.active ? 'rgba(20,40,160,0.08)' : '#F9FAFB',
                border: w.active ? '1.5px solid rgba(20,40,160,0.2)' : '1.5px solid transparent',
              }}
            >
              <p className="text-xs font-bold" style={{ color: w.active ? 'var(--color-primary)' : '#9CA3AF' }}>
                {w.label}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">{w.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
