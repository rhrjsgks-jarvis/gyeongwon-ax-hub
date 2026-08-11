'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { logEvent } from '@/lib/logEvent'
import { parseQuery, hits, ignoredWords, type Condition } from '@/lib/searchTerms'

// 인덱스는 두 파일로 나뉜다(scripts/build-search-index.mjs 참고).
//  - search-index.json  : 검색에 필요한 필드만 담은 경량본. 첫 진입에 받는다.
//  - search-detail.json : 펼쳐볼 때만 쓰는 상세 스펙. 사용자가 처음 결과를 펼칠 때 한 번 받는다.
// 매장에서 폰으로 쓰는 도구라 첫 로딩에 상세까지 받을 이유가 없다. 두 파일은 `i`로 연결된다.
type Entry = {
  i: number      // 상세 파일과 연결되는 인덱스
  t: string      // product | category | care | module
  m: string      // 모듈 키
  title: string
  sub: string
  kw: string     // 소문자 정규화된 검색 키워드(토큰 중복 제거됨)
  href: string
  ext?: boolean | number
  catOk?: boolean | number
  d?: number     // 1이면 상세 스펙이 있다(내용은 search-detail.json에)
}

// 제품 항목 전용 — 카탈로그를 열지 않고 검색 화면에서 바로 펼쳐보는 상세 스펙
type Detail = {
  spec?: [string, string][]
  on?: string[]
  off?: string[]
  price?: number | null
  note?: string
  usp?: string[]
}

const MODULE_META: Record<string, { label: string; icon: string; color: string }> = {
  finder:  { label: '제품 · 모델',       icon: '🔍', color: '#1428A0' },
  install: { label: '설치환경 가이드',   icon: '🛠️', color: '#B45309' },
  compare: { label: '타사비교',         icon: '🔗', color: '#EA580C' },
  care:    { label: 'AI구독 케어',         icon: '💚', color: '#059669' },
  as:      { label: 'AS 관련 정보',      icon: '🛡️', color: '#0D9488' },
  place:   { label: '배치 시뮬레이터',   icon: '📐', color: '#7C3AED' },
  hub:     { label: '허브 기능',        icon: '🏠', color: '#475569' },
}
const MODULE_ORDER = ['hub', 'finder', 'compare', 'install', 'as', 'place', 'care']
const MAX_PER_MODULE = 12

// 검색 결과에서 바로 펼쳐보는 상세 스펙 — 카탈로그 PDF를 열지 않고 확인하기 위한 화면
function SpecDetail({ e, detail }: { e: Entry; detail: Detail | null }) {
  if (!detail) {
    return (
      <div className="mx-2.5 mb-2 rounded-xl border border-blue-100 px-3 py-4 text-center text-xs text-gray-400" style={{ background: '#F8FAFF' }}>
        상세 스펙 불러오는 중…
      </div>
    )
  }
  return <SpecDetailBody e={e} d={detail} />
}

function SpecDetailBody({ e, d }: { e: Entry; d: Detail }) {
  return (
    <div className="mx-2.5 mb-2 rounded-xl border border-blue-100 overflow-hidden" style={{ background: '#F8FAFF' }}>
      <div className="px-3 py-2.5 border-b border-blue-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-400">{e.sub}</p>
          <p className="text-base font-bold text-gray-800 break-all">
            {e.title}
            {e.catOk && (
              <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-700">
                카탈로그 동일모델
              </span>
            )}
          </p>
        </div>
        <span className="text-sm font-bold shrink-0" style={{ color: '#1428A0' }}>
          {d.price == null ? '가격 문의' : `${d.price}만원`}
        </span>
      </div>

      {d.note && <p className="px-3 pt-2 text-[11px] text-amber-700">⚠️ {d.note}</p>}

      <table className="w-full text-[13px]">
        <tbody>
          {(d.spec || []).map(([k, v], i) => (
            <tr key={i} className="border-b border-blue-50 last:border-0">
              <th className="text-left align-top font-semibold text-gray-500 px-3 py-1.5 w-[38%] break-keep">{k}</th>
              <td className="text-gray-800 px-3 py-1.5 break-all">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!!(d.on && d.on.length) && (
        <div className="px-3 py-2.5 border-t border-blue-100">
          <p className="text-[11px] font-bold text-gray-400 mb-1.5">✅ 지원 기능</p>
          <div className="flex flex-wrap gap-1">
            {d.on.map((f, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-blue-200 text-blue-700">{f}</span>
            ))}
          </div>
        </div>
      )}
      {!!(d.off && d.off.length) && (
        <div className="px-3 pb-2.5">
          <p className="text-[11px] font-bold text-gray-400 mb-1.5">✖ 미지원</p>
          <div className="flex flex-wrap gap-1">
            {d.off.map((f, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">{f}</span>
            ))}
          </div>
        </div>
      )}

      {!!(d.usp && d.usp.length) && (
        <div className="px-3 py-2.5 border-t border-blue-100">
          <p className="text-[11px] font-bold text-amber-600 mb-1.5">⭐ 핵심 키워드 · USP</p>
          <div className="flex flex-wrap gap-1">
            {d.usp.map((f, i) => (
              <span key={i} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">{f}</span>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 pb-3">
        <Link href={e.href} className="no-underline">
          <span className="inline-block text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: '#1428A0' }}>
            제품 상세검색에서 열기 →
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
  // 상세 스펙은 첫 "상세 ▼" 클릭 때 한 번만 받아 인덱스별로 캐시한다
  const [details, setDetails] = useState<Record<number, Detail> | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => { setInput(q); setOpenKey(null) }, [q])

  useEffect(() => {
    fetch('/search-index.json')
      .then((r) => r.json())
      .then((d) => setIndex(d.entries || []))
      .catch(() => setIndex([]))
  }, [])

  // 상세 스펙 파일은 사용자가 실제로 펼칠 때만 받는다(첫 진입 로딩량을 줄이기 위함).
  const loadDetails = () => {
    if (details || detailLoading) return
    setDetailLoading(true)
    fetch('/search-detail.json')
      .then((r) => r.json())
      .then((d: { entries: (Detail & { i: number })[] }) => {
        const map: Record<number, Detail> = {}
        for (const { i, ...rest } of d.entries || []) map[i] = rest
        setDetails(map)
      })
      .catch(() => setDetails({}))
      .finally(() => setDetailLoading(false))
  }

  useEffect(() => { if (q) logEvent('hub', 'search', q) }, [q])

  /*
   * 조건은 **AND** 로 걸린다 — 세 가지를 물으면 세 가지가 모두 맞는 것만 남는다.
   * 조건 하나 안에서는 표기가 여러 개라 그중 하나만 맞으면 된다(용어 세분화, lib/searchTerms.ts).
   *
   * 그리고 **어느 조건이 몇 건을 걸렀는지 함께 낸다.** 결과가 0건일 때 "없습니다" 한 줄만
   * 띄우면 상담사는 세 조건 중 무엇이 문제인지 알 수가 없어 통째로 다시 친다. 조건별 건수가
   * 보이면 "1등급이 0건이구나" 하고 그 하나만 빼면 된다.
   */
  const found = useMemo(() => {
    if (!index) return null
    const conds = parseQuery(q)
    if (!conds.length) return { conds, groups: [], per: [], dropped: [] as string[], soft: [] as string[] }

    const per = conds.map((c) => ({ c, n: index.filter((e) => hits(e.kw, c)).length }))

    /*
     * **앱 안에 없는 말은 조건에서 뺀다.** 자연어로 물으면 "수원은 어느 물류센터야" 처럼
     * 조사·어미가 붙은 조각이 섞이는데, AND 라 그 하나가 0건이면 문장 전체가 0건이 된다.
     * 불용어 목록으로는 활용형을 다 못 잡으므로 **실제로 0건인 조건을 뺀다** — 데이터가
     * 스스로 판정하는 셈이라 목록을 관리할 필요가 없다.
     *
     * 조용히 빼지 않는다. 조건별 건수 칩이 그 말을 빨갛게 보여주고, 아래 한 줄이
     * "이건 빼고 찾았습니다"라고 밝힌다 — 안 그러면 "왜 이게 나오지"가 된다.
     */
    const live = per.filter((x) => x.n > 0).map((x) => x.c)
    const dropped = per.filter((x) => !x.n).map((x) => x.c.raw)
    let all = live.length ? index.filter((e) => live.every((c) => hits(e.kw, c))) : []

    /*
     * **0건인 조건만 빼는 것으로는 모자란다.** 뜻 없는 조각이 **하필 한 건에 걸리면**
     * 살아남아 문장 전체를 0건으로 만든다. 세 번 겪었다 —
     * '놓을'(1건) · '년이야'가 '3년이'에 걸린 것. 데이터가 늘수록 이런 우연은 더 생긴다.
     *
     * 그래서 **다 걸어 0건이면 하나를 빼고 다시 본다.** 뺄 것은 빼서 가장 많이 나오는 조건.
     * 상담 중에 "없습니다"로 끝나는 것보다, 결과를 주고 **무엇을 뺐는지 밝히는** 편이 낫다.
     * (조용히 빼지 않는다 — 아래 안내 줄이 그 말을 적는다.)
     */
    const soft: string[] = []
    if (!all.length && live.length > 1) {
      let pick: null | { raw: string; rest: Condition[]; n: number } = null
      for (const c of live) {
        const rest = live.filter((x) => x !== c)
        const n = index.filter((e) => rest.every((r) => hits(e.kw, r))).length
        if (n > 0 && (!pick || n > pick.n)) pick = { raw: c.raw, rest, n }
      }
      if (pick) {
        all = index.filter((e) => pick!.rest.every((r) => hits(e.kw, r)))
        soft.push(pick.raw)
      }
    }

    const groups = MODULE_ORDER
      .map((m) => ({ m, items: all.filter((e) => e.m === m) }))
      .filter((g) => g.items.length > 0)
    return { conds, groups, per, dropped, soft }
  }, [index, q])

  const grouped = found ? found.groups : null
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

      <form onSubmit={submit} className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 무풍 에어컨 1등급 / 식세기 이전설치 / 냉장고 키친핏"
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
      <p className="text-[11px] text-gray-400 mb-5 px-1">
        조건을 <b className="text-gray-500">띄어쓰기로 여러 개</b> 넣으면 모두 맞는 것만 남습니다. 줄여 쓴 말도 알아듣습니다(식세기·김냉·로청·안방).
      </p>

      {/* 자연어로 물으면 '몇'·'수원은' 같은 말이 섞인다. 무엇을 뺐는지 밝힌다 */}
      {q && found && (ignoredWords(q).length > 0 || (found.dropped.length > 0 && total > 0)) && (
        <p className="text-[11px] text-gray-400 mb-2 px-1">
          <span className="text-gray-500">
            {[...ignoredWords(q), ...(total > 0 ? found.dropped : [])].join(' · ')}
          </span>
          {' '}은(는) 앱 안에 없는 말이라 빼고 찾았습니다.
        </p>
      )}

      {/* 함께 걸면 0건이라 하나를 빼고 찾은 경우 — 결과보다 먼저, 눈에 띄게 밝힌다 */}
      {q && found && found.soft.length > 0 && total > 0 && (
        <p className="text-[11px] mb-2 px-1 text-amber-700">
          <b>{found.soft.join(' · ')}</b>
          {' '}까지 함께 맞는 자료는 없어, 그 조건은 <b>빼고</b> 찾았습니다.
        </p>
      )}

      {/* 조건별로 몇 건이 걸렸는지 — 세 가지를 물었을 때 셋 다 인식됐는지 눈으로 확인된다 */}
      {q && found && found.conds.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {found.per.map((p) => (
            <span
              key={p.c.raw}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                p.n ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-red-50 border-red-200 text-red-600'
              }`}
            >
              {p.c.raw} {p.n ? `${p.n}건` : '0건'}
            </span>
          ))}
          <span className="text-[11px] text-gray-400 px-1 py-1">→ 모두 만족 <b className="text-gray-700">{total}건</b></span>
        </div>
      )}

      {!q ? (
        <p className="text-sm text-gray-400 text-center py-10">검색어를 입력해주세요.</p>
      ) : !grouped ? (
        <p className="text-sm text-gray-400 text-center py-10">검색 중…</p>
      ) : total === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-gray-500 mb-1">&ldquo;{q}&rdquo; 검색 결과가 없습니다.</p>
          {found && found.per.every((p) => !p.n) ? (
            <p className="text-xs text-gray-400">
              앱 안에 없는 말입니다 —{' '}
              <b className="text-red-500">{found.per.map((p) => p.c.raw).join(' · ')}</b>
            </p>
          ) : found && found.conds.length > 2 ? (
            <p className="text-xs text-gray-400">
              조건이 <b>{found.conds.length}가지</b>입니다 — 하나만 빼서는 맞는 자료가 없습니다.
              위 칩에서 건수가 적은 조건을 빼고 다시 물어보세요.
            </p>
          ) : (
            <p className="text-xs text-gray-400">제품명·모델코드·카테고리·기능명으로 검색해보세요.</p>
          )}
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
                      const hasDetail = !!e.d
                      if (hasDetail) {
                        const open = openKey === key
                        return (
                          <div key={key}>
                            <button
                              type="button"
                              onClick={() => { loadDetails(); setOpenKey(open ? null : key) }}
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
                            {open && <SpecDetail e={e} detail={details ? details[e.i] || {} : null} />}
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
