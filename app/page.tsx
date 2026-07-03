import Link from 'next/link'

const MODULES = [
  {
    href: '/finder',
    icon: '🔍',
    title: '모델파인더',
    desc: '키워드 한 줄로 CE·MX 전 제품 검색',
    color: '#1428A0',
    bg: '#EEF2FF',
    status: 'live',
  },
  {
    href: '/care',
    icon: '💚',
    title: 'AI Care 검색기',
    desc: '구독케어 서비스 항목 조건 검색',
    color: '#059669',
    bg: '#ECFDF5',
    status: 'live',
  },
  {
    href: '/test',
    icon: '📝',
    title: '레벨업테스트',
    desc: '2026 제품 전문가 역량 평가 · 25문항',
    color: '#7C3AED',
    bg: '#F5F3FF',
    status: 'live',
  },
  {
    href: '/compare',
    icon: '⚖️',
    title: '타사비교 가이드',
    desc: 'URL 입력 → 스펙 비교표 + 응대 스크립트 자동 생성',
    color: '#EA580C',
    bg: '#FFF7ED',
    status: 'live',
  },
  {
    href: '/quiz',
    icon: '🎯',
    title: 'URL 퀴즈 생성기',
    desc: '제품 페이지 URL로 직원 교육용 퀴즈 자동 생성',
    color: '#0891B2',
    bg: '#ECFEFF',
    status: 'live',
  },
  {
    href: '/admin',
    icon: '📊',
    title: 'AX 현황 대시보드',
    desc: '모듈별 사용 현황 · 팀 활용도 통계',
    color: '#475569',
    bg: '#F8FAFC',
    status: 'building',
  },
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
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <div className="max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 mb-1">{today}</p>
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
            <p className="font-bold mb-0.5">AX 허브 구축 30일 플랜 시작</p>
            <p className="opacity-80 text-xs">
              Day 1 · 7개 영업지원 도구를 단일 플랫폼으로 통합합니다.
                       매일 업데이트 예정.
            </p>
          </div>
        </div>
      </div>

      {/* 모듈 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
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
              <h2
                className="font-bold text-base mb-1 group-hover:text-[#1428A0] transition-colors"
              >
                {mod.title}
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed">{mod.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* 진행 현황 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-gray-700 mb-3">📅 30일 실행 현황</h3>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: '3.3%', background: 'var(--color-primary)' }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-500">Day 1 / 30</span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center mt-3">
          {[
            { label: '1주차', desc: '기반 구축', active: true },
            { label: '2주차', desc: 'LLM 모듈', active: false },
            { label: '3주차', desc: '로그·실사용', active: false },
            { label: '4주차', desc: '검증·발표', active: false },
          ].map((w) => (
            <div
              key={w.label}
              className="rounded-xl py-2 px-1"
              style={{
                background: w.active ? 'rgba(20,40,160,0.08)' : '#F9FAFB',
                border: w.active ? '1.5px solid rgba(20,40,160,0.2)' : '1.5px solid transparent',
              }}
            >
              <p
                className="text-xs font-bold"
                style={{ color: w.active ? 'var(--color-primary)' : '#9CA3AF' }}
              >
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
