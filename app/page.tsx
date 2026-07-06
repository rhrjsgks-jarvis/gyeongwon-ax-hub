'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { logEvent } from '@/lib/logEvent'

const PROJECT_START = new Date('2026-06-30')
const TOTAL_DAYS = 30

const MODULES = [
  {
    href: '/finder',
    icon: '🔍',
    title: '모델파인더',
    desc: '키워드 한 줄로 CE·MX 전 제품(206종) 검색',
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
    href: '/compare',
    icon: '⚡',
    title: 'AI 생성기',
    desc: '타사비교 가이드 · URL 퀴즈 — URL 입력으로 즉시 생성',
    color: '#EA580C',
    bg: '#FFF7ED',
    updated: '2026.07',
    status: 'live',
  },
  {
    href: '/admin',
    icon: '📊',
    title: 'AX 현황 대시보드',
    desc: '모듈별 사용 현황 · 팀 AI 활용도 통계 · CSV 내보내기',
    color: '#475569',
    bg: '#F8FAFC',
    updated: '2026.07',
    status: 'live',
  },
]

const TIPS = [
  { emoji: '🛒', situation: '고객이 타사 제품을 비교할 때', tool: 'AI 생성기', href: '/compare' },
  { emoji: '📋', situation: '케어십 서비스 항목을 안내할 때', tool: 'AI Care 검색기', href: '/care' },
  { emoji: '🔎', situation: '제품 스펙을 빠르게 확인할 때', tool: '모델파인더', href: '/finder' },
  { emoji: '🎓', situation: '팀 교육 퀴즈 자료를 만들 때', tool: 'AI 생성기 → 퀴즈 탭', href: '/compare' },
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

export default function Home() {
  useEffect(() => { logEvent('hub', 'page_view') }, [])

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

      {/* 모듈 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {MODULES.map((mod) => (
          <Link key={mod.href} href={mod.href} className="no-underline">
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
                {mod.title}
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed mb-2">{mod.desc}</p>
              <p className="text-[10px] text-gray-300 font-medium">DB {mod.updated} 기준</p>
            </div>
          </Link>
        ))}
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
