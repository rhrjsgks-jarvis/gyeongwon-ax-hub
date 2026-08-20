'use client'

import { useEffect, useState } from 'react'
import { readLogs, fetchTeamLogs, aggregateByModule, aggregateByDay, aggregateByStore, exportCsv, excludeHubViews, LogEvent } from '@/lib/logEvent'
import Icon, { IconName } from '@/components/Icon'

// 인증 상태는 sessionStorage에 만료시각과 함께 둔다.
// 이전에는 localStorage에 '1'만 저장해 한 번 통과한 기기는 브라우저를 껐다 켜도 영구히
// 열려 있었다(비밀번호를 걸어 둔 의미가 없었다). 지금은 ①탭/브라우저를 닫으면 잠기고
// ②같은 세션이라도 2시간이 지나면 다시 물어본다.
const ADMIN_SESSION_KEY = 'ax_admin_unlocked_until'
const LEGACY_KEY = 'ax_admin_unlocked'
const UNLOCK_TTL_MS = 2 * 60 * 60 * 1000

function isUnlocked(): boolean {
  try {
    const until = Number(sessionStorage.getItem(ADMIN_SESSION_KEY) || 0)
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}

function markUnlocked(): void {
  try { sessionStorage.setItem(ADMIN_SESSION_KEY, String(Date.now() + UNLOCK_TTL_MS)) } catch {}
}

function lockNow(): void {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
    localStorage.removeItem(LEGACY_KEY)
  } catch {}
}

function AdminGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState<'' | 'wrong' | 'locked'>('')
  const [checking, setChecking] = useState(false)

  const submit = async () => {
    setChecking(true)
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const data = await res.json()
      if (data.ok) {
        markUnlocked()
        onUnlock()
      } else {
        setError(res.status === 429 ? 'locked' : 'wrong')
      }
    } catch {
      setError('wrong')
    }
    setChecking(false)
  }

  return (
    <div className="max-w-sm mx-auto pt-24 px-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-center">
        <div className="mb-2 flex justify-center"><Icon name="lock" size={28} style={{ color: '#1428A0' }} /></div>
        <h1 className="font-bold text-gray-800 mb-1">관리자 인증</h1>
        <p className="text-xs text-gray-400 mb-4">
          사용현황 대시보드[관리자용]는 비밀번호로 보호됩니다<br />
          <span className="text-[10px]">인증은 브라우저를 닫으면 해제되고, 2시간 뒤 다시 물어봅니다</span>
        </p>
        <input
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="비밀번호"
          autoFocus
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2 focus:outline-none focus:border-blue-400"
        />
        {error === 'wrong' && <p className="text-xs text-red-500 mb-2">비밀번호가 올바르지 않습니다</p>}
        {error === 'locked' && (
          <p className="text-xs text-red-500 mb-2">
            시도 횟수를 초과했습니다. 10분 뒤에 다시 시도해 주세요
          </p>
        )}
        <button
          onClick={submit}
          disabled={checking || !pw}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: '#1428A0' }}
        >
          입장하기
        </button>
      </div>
    </div>
  )
}

const ROI_DATA = [
  { key: 'finder',  icon: 'finder' as IconName, label: '통합검색 — 자료 찾기',      before: '5분/건',    after: '15초/건',  saving: 95 },
  { key: 'compare', icon: 'compare' as IconName, label: '타사비교 가이드 생성',       before: '30분/건',   after: '3분/건',   saving: 90 },
  { key: 'quiz',    icon: 'target' as IconName, label: 'URL 퀴즈 출제',              before: '4시간/회',  after: '5분/회',   saving: 98 },
  { key: 'care',    icon: 'care' as IconName, label: 'AI구독 케어 항목 확인',     before: '10분/건',   after: '30초/건',  saving: 95 },
  { key: 'test',    icon: 'quiz' as IconName, label: '레벨업 챌린지 출제 준비',      before: '4시간/회',  after: '즉시',     saving: 99 },
]

/*
 * `retired: true` 는 **운영이 끝났거나 다른 모듈로 통합된** 것이다.
 *
 * 라벨은 남기고 **모듈별 사용 현황 목록에서만 감춘다**(2026-08-11 사용자 요청).
 * 지우지 않는 이유는 두 가지다 — ①구글 시트에 과거 로그가 남아 있어 최근 이벤트
 * 목록·CSV 에서 여전히 이름이 필요하고 ②지우면 그 자리에 모듈 키(`planner`)가
 * 그대로 노출된다. 화면에서 빼는 것과 데이터에서 지우는 것은 다른 일이다.
 */
/* 아이콘은 **그 도구가 허브에서 쓰는 것과 같은 것**을 쓴다 — 자리마다 다른 그림이면 눈이 헤맨다 */
const MODULE_META: Record<string, { label: string; icon: IconName; color: string; retired?: boolean }> = {
  // 허브 메인 페이지뷰는 집계에서 제외되므로 여기 남는 건 통합검색·건의뿐이다
  hub:     { label: '허브 검색·건의',   icon: 'search',   color: '#1428A0' },
  finder:  { label: '통합검색',        icon: 'finder',   color: '#2563EB' },
  care:    { label: 'AI구독 케어',         icon: 'care',     color: '#059669' },
  compare: { label: '타사비교 가이드', icon: 'compare',  color: '#D97706' },
  install: { label: '설치환경 가이드',  icon: 'install',  color: '#B45309' },
  /* 아래 셋은 MODULE_META 에 아예 없어서 사용 현황에 한 줄도 안 잡히고 있었다
     (2026-08-11 발견). 운영 중인 모듈이 통계에서 통째로 빠지면 "안 쓴다"로 읽힌다. */
  as:      { label: 'AS 관련 정보',     icon: 'warranty', color: '#0D9488' },
  installcost: { label: '설치비용 · 사전준비', icon: 'bolt', color: '#0369A1' },
  place:   { label: '가전 배치 시뮬레이터', icon: 'place',    color: '#4F46E5' },
  test:    { label: '레벨업 챌린지',    icon: 'quiz',     color: '#7C3AED' },
  quiz:    { label: 'URL 퀴즈',        icon: 'target',   color: '#DC2626' },
  concierge: { label: '컨시어지 프로그램', icon: 'ticket',   color: '#DB2777' },
  poster:  { label: '컨시어지 접수 포스터', icon: 'printer',  color: '#9333EA' },
  coupon:  { label: '시크릿쿠폰',      icon: 'coupon',   color: '#DC2626' },
  catalog: { label: '모바일 카탈로그',  icon: 'catalog',  color: '#0EA5E9' },

  // ── 운영 종료·통합 (목록에서는 감춘다) ──
  compareInstant: { label: '즉시비교 (타사비교로 통합)', icon: 'bolt', color: '#B45309', retired: true },
  planner: { label: '패키지 플래너 (운영 종료)', icon: 'doc', color: '#0891B2', retired: true },
}

/** 화면에 세우는 모듈 — 운영 중인 것만. */
const LIVE_MODULES = Object.entries(MODULE_META).filter(([, m]) => !m.retired)

export default function AdminPage() {
  const [logs, setLogs]         = useState<LogEvent[]>([])
  const [teamWide, setTeamWide] = useState(false)
  const [loaded, setLoaded]     = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [gateChecked, setGateChecked] = useState(false)

  useEffect(() => {
    // 예전 방식(localStorage에 영구 저장)으로 열려 있던 기기는 여기서 정리해 다시 잠근다.
    try { localStorage.removeItem(LEGACY_KEY) } catch {}
    if (isUnlocked()) setUnlocked(true)
    setGateChecked(true)
  }, [])

  useEffect(() => {
    if (!unlocked) return
    // 관리자 대시보드 조회 자체는 로그로 남기지 않는다 — 이 페이지를 열 때마다
    // hub 페이지뷰가 1건씩 늘어 집계가 부풀려졌다.
    ;(async () => {
      // 화면·CSV 모두 허브 메인 페이지뷰를 뺀 로그로 통일한다(집계와 내보내기가 어긋나지 않게).
      const team = await fetchTeamLogs()
      if (team) {
        setLogs(excludeHubViews(team))
        setTeamWide(true)
      } else {
        setLogs(excludeHubViews(readLogs()))
        setTeamWide(false)
      }
      setLoaded(true)
    })()
  }, [unlocked])

  if (!gateChecked) return <div className="p-6 text-gray-400 text-sm">로딩 중…</div>
  if (!unlocked) return <AdminGate onUnlock={() => setUnlocked(true)} />
  if (!loaded) return <div className="p-6 text-gray-400 text-sm">로딩 중…</div>

  const byModule   = aggregateByModule(logs)
  const byDay      = aggregateByDay(logs, 14)
  const byStore    = aggregateByStore(logs)
  const totalViews = logs.filter(e => e.action === 'page_view').length
  const uniqueUids = new Set(logs.map(e => e.uid)).size
  const maxDay     = Math.max(...byDay.map(d => d.count), 1)
  const recent     = [...logs].reverse().slice(0, 20)

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <div
        className="rounded-2xl p-4 mb-5 text-white"
        style={{ background: 'linear-gradient(135deg, #1428A0, #2563EB)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Icon name="dashboard" size={20} style={{ color: '#1428A0' }} />
          <span className="font-bold text-base">사용현황 대시보드[관리자용]</span>
          <button
            onClick={() => { lockNow(); setUnlocked(false) }}
            className="ml-auto text-[11px] font-semibold rounded-lg px-2.5 py-1"
            style={{ background: 'rgba(255,255,255,0.18)' }}
          >
            잠그기
          </button>
        </div>
        <p className="text-xs text-blue-200">
          세일즈 코파일럿 · 사용 현황 · {teamWide ? '팀 전체 집계 (Google Sheets 연동)' : 'localStorage 기반 · 이 기기에서만 누적'}
        </p>
        <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
          허브 메인화면 조회수는 집계에서 제외됩니다 (모든 모듈의 진입점이라 실사용 신호가 아님)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <KpiCard label="총 페이지뷰"   value={totalViews}  icon="eye" color="#1428A0" />
        <KpiCard label="누적 세션"     value={uniqueUids}  icon="user" color="#2563EB" />
        <KpiCard label="기록된 이벤트" value={logs.length} icon="doc" color="#059669" />
        <KpiCard label="추적 모듈 수"  value={LIVE_MODULES.length} icon="puzzle" color="#7C3AED" />
      </div>

      {/*
        * **점별 사용 현황**(2026-08-20 사장님 요청). 지점은 첫 접속에서 고른 값이
        * 기기에 남아 모든 이벤트에 실린다. 고르기 전에 쌓인 옛 로그는 지점 칸이 비어
        * '(미지정)'으로 따로 센다 — 0 으로 적으면 "안 썼다"는 거짓말이 되고,
        * 빼 버리면 합계가 안 맞는다.
        */}
      <Section title={`점별 사용 현황 (${byStore.length}곳)`}>
        {byStore.length === 0 ? (
          <p className="text-sm text-gray-400">아직 기록이 없습니다.</p>
        ) : (
          <div className="space-y-2.5">
            {byStore.map((st) => {
              const max = byStore[0].count || 1
              const unknown = st.code === '(미지정)'
              return (
                <div key={st.code} className="flex items-center gap-3">
                  <span
                    className="text-xs w-28 shrink-0 truncate"
                    style={{ color: unknown ? '#9aa0a6' : '#374151', fontWeight: unknown ? 500 : 600 }}
                    title={`${st.name} (${st.code})`}
                  >
                    {st.name}
                  </span>
                  <span className="text-[10px] w-12 shrink-0 text-gray-400 tracking-wide">
                    {unknown ? '' : st.code}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((st.count / max) * 100)}%`,
                        background: unknown ? '#c3c7cf' : 'var(--color-primary)',
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold w-10 text-right tabular-nums">{st.count}</span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="모듈별 사용 현황">
        <div className="space-y-2.5">
          {LIVE_MODULES.map(([key, meta]) => {
            const count = byModule[key] || 0
            /* 막대 길이는 **보이는 모듈 중** 최대치를 기준으로 잡는다. 감춘 모듈까지
               넣으면 화면에 없는 값이 기준이 돼 막대가 이유 없이 짧아진다. */
            const maxVal = Math.max(...LIVE_MODULES.map(([k]) => byModule[k] || 0), 1)
            const pct = Math.round((count / maxVal) * 100)
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-gray-700">
                    <Icon name={meta.icon} size={13} className="inline-block align-[-2px] mr-1" /> {meta.label}
                  </span>
                  <span className="text-xs font-bold" style={{ color: meta.color }}>{count}회</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: pct + '%', background: meta.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        {/* 감춘 모듈의 로그는 "기록된 이벤트" 총계에는 그대로 들어 있다.
            밝혀 두지 않으면 목록 합계와 총계가 어긋나 보여 수치를 의심하게 된다. */}
        {(() => {
          const n = Object.entries(MODULE_META)
            .filter(([, m]) => m.retired)
            .reduce((a, [k]) => a + (byModule[k] || 0), 0)
          if (!n) return null
          /* 모듈 이름은 적지 않는다 — 가려 달라고 한 것을 각주로 되살리면 뜻이 없다.
             건수만 밝혀 "목록 합계 ≠ 총계"가 오류로 보이지 않게 한다. */
          return (
            <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
              운영이 끝났거나 다른 모듈로 통합된 과거 로그 {n}건은 목록에서 제외했습니다 —
              총계와 CSV 에는 그대로 포함됩니다.
            </p>
          )
        })()}
      </Section>

      <Section title="최근 14일 일별 활동">
        <div className="flex items-end gap-1 h-24">
          {byDay.map((d) => {
            const h = Math.round((d.count / maxDay) * 80)
            const todayKst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
            const isToday = d.date === todayKst
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t transition-all duration-300"
                  style={{
                    height: Math.max(h, d.count > 0 ? 4 : 0) + 'px',
                    background: isToday ? '#1428A0' : '#93C5FD',
                    minHeight: d.count > 0 ? '4px' : '0px',
                  }}
                  title={d.date + ': ' + d.count + '회'}
                />
                <span
                  className="text-[9px] text-gray-400"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  {d.date.slice(5)}
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="최근 활동">
        {recent.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">아직 기록된 활동이 없습니다</p>
        ) : (
          <div className="space-y-1.5">
            {recent.map((ev, i) => {
              const meta = MODULE_META[ev.module] || { icon: 'doc' as IconName, label: ev.module, color: '#666' }
              const t = new Date(ev.ts + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 16)
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-28 shrink-0">{t}</span>
                  <Icon name={meta.icon} size={14} style={{ color: meta.color }} />
                  <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
                  <span className="text-gray-400">
                    · {ev.action}{ev.extra ? ' (' + ev.extra + ')' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => exportCsv(logs)}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: '#1428A0' }}
        >
          CSV 내보내기 ({logs.length}건)
        </button>
        {!teamWide && (
          <button
            onClick={() => {
              if (confirm('이 기기에 저장된 로그를 삭제할까요?')) {
                localStorage.removeItem('axhub_logs')
                setLogs([])
              }
            }}
            className="py-2.5 px-4 rounded-xl text-sm font-semibold text-red-600 border border-red-200 bg-red-50"
          >
            초기화
          </button>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-3">
        {teamWide
          ? '팀원 전체 기기의 사용 로그를 Google Sheets에서 집계한 데이터입니다.'
          : '이 데이터는 현재 기기 브라우저에만 저장됩니다 · Google Apps Script 연동 시 팀 전체 집계 가능'}
      </p>

      {/* AI 효과 정량화 섹션 */}
      <div className="mt-5">
        <div
          className="rounded-2xl p-4 mb-3 text-white"
          style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Icon name="dashboard" size={20} style={{ color: '#1428A0' }} />
            <span className="font-bold text-base">AI 업무 효율화 효과</span>
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>
            세일즈 코파일럿 도입 전·후 업무 시간 비교 (팀원 1인 기준)
          </p>
        </div>

        <div className="space-y-2.5">
          {ROI_DATA.map((item) => (
            <div key={item.key} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon name={item.icon} size={18} style={{ color: '#1428A0' }} />
                  <span className="text-sm font-bold text-gray-800">{item.label}</span>
                </div>
                <span
                  className="text-sm font-bold rounded-full px-2.5 py-0.5"
                  style={{ background: '#dcfce7', color: '#15803d' }}
                >
                  {item.saving}% 절감
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <Icon name="timer" size={13} className="text-red-400" />
                  <span>기존: <b className="text-gray-700">{item.before}</b></span>
                </div>
                <span className="text-gray-300">→</span>
                <div className="flex items-center gap-1.5">
                  <Icon name="bolt" size={13} className="text-green-500" />
                  <span>AI: <b className="text-green-700">{item.after}</b></span>
                </div>
              </div>
              <div className="mt-2.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: item.saving + '%', background: 'linear-gradient(90deg, #059669, #34d399)' }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* 누적 절감 추산 */}
        <div
          className="rounded-2xl p-4 mt-3"
          style={{ background: 'linear-gradient(135deg, #1e3a5f, #1428A0)' }}
        >
          <p className="text-xs font-bold text-blue-200 mb-2 flex items-center gap-1"><Icon name="bulb" size={13} /> 팀 기준 월간 절감 추산</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { num: '36h+', label: '월 절감 시간', sub: '팀원 1인' },
              { num: '5종', label: 'AI 도구', sub: '즉시 현장 투입' },
              { num: '574문', label: '문제은행', sub: '자동 생성·관리' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-xl font-bold text-white">{s.num}</p>
                <p className="text-[10px] text-blue-200 mt-0.5">{s.label}</p>
                <p className="text-[9px] text-blue-300">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: IconName; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon name={icon} size={16} style={{ color }} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value.toLocaleString()}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm mb-3">
      <h3 className="text-sm font-bold text-gray-700 mb-3">{title}</h3>
      {children}
    </div>
  )
}
