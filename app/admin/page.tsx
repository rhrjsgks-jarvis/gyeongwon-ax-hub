'use client'

import { useEffect, useState } from 'react'
import { readLogs, aggregateByModule, aggregateByDay, exportCsv, logEvent, LogEvent } from '@/lib/logEvent'

const MODULE_META: Record<string, { label: string; icon: string; color: string }> = {
  hub:     { label: '허브 메인',       icon: '🏠', color: '#1428A0' },
  finder:  { label: '모델파인더',      icon: '🔍', color: '#2563EB' },
  care:    { label: 'AI Care',         icon: '🛠️', color: '#059669' },
  test:    { label: '레벨업테스트',    icon: '📝', color: '#7C3AED' },
  compare: { label: '타사비교 가이드', icon: '⚖️', color: '#D97706' },
  quiz:    { label: 'URL 퀴즈',        icon: '🎯', color: '#DC2626' },
}

export default function AdminPage() {
  const [logs, setLogs]     = useState<LogEvent[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    logEvent('hub', 'page_view')
    setLogs(readLogs())
    setLoaded(true)
  }, [])

  if (!loaded) return <div className="p-6 text-gray-400 text-sm">로딩 중…</div>

  const byModule   = aggregateByModule(logs)
  const byDay      = aggregateByDay(logs, 14)
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
          <span className="text-xl">📊</span>
          <span className="font-bold text-base">AX 현황 대시보드</span>
        </div>
        <p className="text-xs text-blue-200">
          경원 AX 허브 · 사용 현황 · localStorage 기반 · 이 기기에서 누적
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <KpiCard label="총 페이지뷰"   value={totalViews}  icon="👁️" color="#1428A0" />
        <KpiCard label="누적 세션"     value={uniqueUids}  icon="👤" color="#2563EB" />
        <KpiCard label="기록된 이벤트" value={logs.length} icon="📋" color="#059669" />
        <KpiCard label="추적 모듈 수"  value={Object.keys(MODULE_META).length} icon="🧩" color="#7C3AED" />
      </div>

      <Section title="모듈별 사용 현황">
        <div className="space-y-2.5">
          {Object.entries(MODULE_META).map(([key, meta]) => {
            const count = byModule[key] || 0
            const maxVal = Math.max(...Object.values(byModule), 1)
            const pct = Math.round((count / maxVal) * 100)
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-gray-700">
                    {meta.icon} {meta.label}
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
              const meta = MODULE_META[ev.module] || { icon: '?', label: ev.module, color: '#666' }
              const t = new Date(ev.ts + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 16)
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-28 shrink-0">{t}</span>
                  <span>{meta.icon}</span>
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
          📥 CSV 내보내기 ({logs.length}건)
        </button>
        <button
          onClick={() => {
            if (confirm('모든 로그를 삭제할까요?')) {
              localStorage.removeItem('axhub_logs')
              setLogs([])
            }
          }}
          className="py-2.5 px-4 rounded-xl text-sm font-semibold text-red-600 border border-red-200 bg-red-50"
        >
          🗑️ 초기화
        </button>
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-3">
        이 데이터는 현재 기기 브라우저에만 저장됩니다 · Google Apps Script 연동 시 팀 전체 집계 가능
      </p>
    </div>
  )
}

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{icon}</span>
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
