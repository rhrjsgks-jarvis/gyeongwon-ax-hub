'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { logEvent } from '@/lib/logEvent'

type Entry = {
  t: string      // product | category | care | module
  m: string      // 모듈 키
  title: string
  sub: string
  kw: string     // 소문자 정규화된 검색 키워드
  href: string
  ext?: boolean
  // 제품 항목 전용 — 카탈로그를 열지 않고 검색 화면에서 바로 펼쳐보는 상세 스펙
  spec?: [string, string][]
  on?: string[]
  off?: string[]
  price?: number | null
  note?: string
  usp?: string[]
}

const MODULE_META: Record<string, { label: string; icon: string; color: string }> = {
  finder:  { label: '모델파인더',       icon: '🔍', color: '#1428A0' },
  install: { label: '설치환경 가이드',   icon: '🛠️', color: '#B45309' },
  compare: { label: '타사비교',         icon: '🔗', color: '#EA580C' },
  care:    { label: 'AI Care',         icon: '💚', color: '#059669' },
  planner: { label: '패키지 플래너',     icon: '📦', color: '#0891B2' },
  hub:     { label: '허브 기능',        icon: '🏠', color: '#475569' },
}
const MODULE_ORDER = ['hub', 'finder', 'compare', 'install', 'care', 'planner']
const MAX_PER_MODULE = 12

// 공백으로 나눈 모든 토큰을 포함해야 매칭(AND) — "무풍 에어컨"처럼 조합 검색이 되게 한다.
function match(e: Entry, tokens: string[]) {
  return tokens.every((t) => e.kw.includes(t))
}

// 검색 결과에서 바로 펼쳐보는 상세 스펙 — 카탈로그 PDF를 열지 않고 확인하기 위한 화면
function SpecDetail({ e }: { e: Entry }) {
  return (
    <div className="mx-2.5 mb-2 rounded-xl border border-blue-100 overflow-hidden" style={{ background: '#F8FAFF' }}>
      <div className="px-3 py-2.5 border-b border-blue-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-400">{e.sub}</p>
          <p className="text-base font-bold text-gray-800 break-all">{e.title}</p>
        </div>
        <span className="text-sm font-bold shrink-0" style={{ color: '#1428A0' }}>
          {e.price == null ? '가격 문의' : `${e.price}만원`}
        </span>
      </div>

      {e.note && <p className="px-3 pt-2 text-[11px] text-amber-700">⚠️ {e.note}</p>}

      <table className="w-full text-[13px]">
        <tbody>
          {(e.spec || []).map(([k, v], i) => (
            <tr key={i} className="border-b border-blue-50 last:border-0">
              <th className="text-left align-top font-semibold text-gray-500 px-3 py-1.5 w-[38%] break-keep">{k}</th>
              <td className="text-gray-800 px-3 py-1.5 break-all">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!!(e.on && e.on.length) && (
        <div className="px-3 py-2.5 border-t border-blue-100">
          <p className="text-[11px] font-bold text-gray-400 mb-1.5">✅ 지원 기능</p>
          <div className="flex flex-wrap gap-1">
            {e.on.map((f, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-blue-200 text-blue-700">{f}</span>
            ))}
          </div>
        </div>
      )}
      {!!(e.off && e.off.length) && (
        <div className="px-3 pb-2.5">
          <p className="text-[11px] font-bold text-gray-400 mb-1.5">✖ 미지원</p>
          <div className="flex flex-wrap gap-1">
            {e.off.map((f, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">{f}</span>
            ))}
          </div>
        </div>
      )}

      {!!(e.usp && e.usp.length) && (
        <div className="px-3 py-2.5 border-t border-blue-100">
          <p className="text-[11px] font-bold text-amber-600 mb-1.5">⭐ 핵심 키워드 · USP</p>
          <div className="flex flex-wrap gap-1">
            {e.usp.map((f, i) => (
              <span key={i} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">{f}</span>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 pb-3">
        <Link href={e.href} className="no-underline">
          <span className="inline-block text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: '#1428A0' }}>
            모델파인더에서 열기 →
          </span>
        </Link>
      </div>
    </div>
  )
}

function SearchResults() {
  const params = useSearchParams()
  const router = useRouter()
  const q = params.get('q') || ''
  const [input, setInput] = useState(q)
  const [index, setIndex] = useState<Entry[] | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)

  useEffect(() => { setInput(q); setOpenKey(null) }, [q])

  useEffect(() => {
    fetch('/search-index.json')
      .then((r) => r.json())
      .then((d) => setIndex(d.entries || []))
      .catch(() => setIndex([]))
  }, [])

  useEffect(() => { if (q) logEvent('hub', 'search', q) }, [q])

  const grouped = useMemo(() => {
    if (!index) return null
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!tokens.length) return []
    const hits = index.filter((e) => match(e, tokens))
    return MODULE_ORDER
      .map((m) => ({ m, items: hits.filter((e) => e.m === m) }))
      .filter((g) => g.items.length > 0)
  }, [index, q])

  const total = grouped ? grouped.reduce((s, g) => s + g.items.length, 0) : 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const v = input.trim()
    if (v) router.push(`/search?q=${encodeURIComponent(v)}`)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
        <Link href="/" className="hover:text-gray-600 no-underline">🏠 허브</Link>
        <span>›</span>
        <span className="text-gray-600">통합검색</span>
      </div>

      <form onSubmit={submit} className="flex gap-2 mb-5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 무풍 / 김치냉장고 / RM90H91B1W / 설치"
          autoFocus
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400"
        />
        <button
          type="submit"
          className="px-5 rounded-xl text-sm font-bold text-white shrink-0"
          style={{ background: '#1428A0' }}
        >
          검색
        </button>
      </form>

      {!q ? (
        <p className="text-sm text-gray-400 text-center py-10">검색어를 입력해주세요.</p>
      ) : !grouped ? (
        <p className="text-sm text-gray-400 text-center py-10">검색 중…</p>
      ) : total === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-gray-500 mb-1">&ldquo;{q}&rdquo; 검색 결과가 없습니다.</p>
          <p className="text-xs text-gray-400">제품명·모델코드·카테고리·기능명으로 검색해보세요.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">
            <b className="text-gray-700">{q}</b> · 총 {total}건
          </p>
          <div className="flex flex-col gap-4">
            {grouped.map((g) => {
              const meta = MODULE_META[g.m]
              const shown = g.items.slice(0, MAX_PER_MODULE)
              return (
                <div key={g.m} className="bg-white rounded-2xl p-4 border border-gray-100">
                  <h2 className="font-bold text-sm mb-2.5" style={{ color: meta.color }}>
                    {meta.icon} {meta.label}
                    <span className="text-gray-300 font-medium ml-1.5">{g.items.length}건</span>
                  </h2>
                  <div className="flex flex-col gap-0.5">
                    {shown.map((e, i) => {
                      // 스펙이 있는 제품은 페이지 이동 대신 그 자리에서 상세를 펼친다
                      // (카탈로그 PDF를 뒤지지 않고 검색 화면에서 바로 확인하기 위함)
                      const key = `${g.m}-${i}`
                      const hasDetail = !!(e.spec && e.spec.length)
                      if (hasDetail) {
                        const open = openKey === key
                        return (
                          <div key={key}>
                            <button
                              type="button"
                              onClick={() => setOpenKey(open ? null : key)}
                              className="w-full text-left"
                            >
                              <div className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${open ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 truncate">{e.title}</p>
                                  <p className="text-[11px] text-gray-400 truncate">{e.sub}</p>
                                </div>
                                <span className="text-gray-400 text-[11px] shrink-0">
                                  {open ? '닫기 ▲' : '상세 ▼'}
                                </span>
                              </div>
                            </button>
                            {open && <SpecDetail e={e} />}
                          </div>
                        )
                      }
                      const body = (
                        <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-gray-50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {e.title}{e.ext && <span className="text-gray-300 font-normal"> ↗</span>}
                            </p>
                            <p className="text-[11px] text-gray-400 truncate">{e.sub}</p>
                          </div>
                          <span className="text-gray-300 text-xs shrink-0">›</span>
                        </div>
                      )
                      return e.ext ? (
                        <a key={key} href={e.href} target="_blank" rel="noopener noreferrer" className="no-underline">{body}</a>
                      ) : (
                        <Link key={key} href={e.href} className="no-underline">{body}</Link>
                      )
                    })}
                  </div>
                  {g.items.length > shown.length && (
                    <p className="text-[11px] text-gray-400 px-2.5 pt-1.5">
                      외 {g.items.length - shown.length}건 — {meta.label}에서 더 보기
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400 text-center py-10">로딩 중…</p>}>
      <SearchResults />
    </Suspense>
  )
}
