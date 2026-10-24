'use client'

/*
 * 통합검색 입력칸 + 자동완성(2026-10-21 사장님 요청).
 *
 * 허브 상단과 /search 두 곳이 **같은 입력칸**을 쓴다 — 따로 만들면 한쪽만 고쳐져 두 검색창이 다르게 군다.
 *
 * - 후보는 `search-suggest.json`(제목·모듈·주소만, 빌드가 색인과 함께 만든다)에서 낸다.
 *   허브가 자동완성 하나 하려고 1MB 넘는 색인을 받지 않게 **처음 칸을 눌렀을 때** 한 번만 받는다.
 * - 후보를 고르면 **그 항목으로 바로 간다**(검색 결과를 한 번 더 거치지 않는다).
 *   Enter 를 그냥 누르면 지금처럼 통합검색이다 — 자동완성이 검색을 대신하지 않는다.
 * - 칸이 비었거나 후보가 없으면 아무것도 띄우지 않는다.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { rankSuggest, type Sug } from '../lib/suggest'

const MOD_LABEL: Record<string, string> = {
  finder: '모델파인더', compare: '타사비교', install: '설치환경', installcost: '설치비용',
  as: 'AS', place: '배치', care: '구독케어', hub: '도구',
}

let cache: Sug[] | null = null
let loading: Promise<Sug[]> | null = null
function loadSuggest(): Promise<Sug[]> {
  if (cache) return Promise.resolve(cache)
  if (!loading) {
    loading = fetch('/search-suggest.json')
      .then((r) => r.json())
      .then((d) => (cache = (d.s || []) as Sug[]))
      .catch(() => { loading = null; return [] as Sug[] })
  }
  return loading
}

export default function SearchBox({
  value, onChange, onSubmit, placeholder, autoFocus, inputClassName, onDark,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  placeholder: string
  autoFocus?: boolean
  inputClassName: string
  /** 남색 헤더 위에 놓일 때 — 검색 단추를 흰 바탕으로(남색 위 남색 단추는 안 보인다) */
  onDark?: boolean
}) {
  const router = useRouter()
  const [list, setList] = useState<Sug[] | null>(cache)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const wrap = useRef<HTMLDivElement>(null)

  const items = list && open ? rankSuggest(list, value) : []

  useEffect(() => { setHi(-1) }, [value])
  useEffect(() => {
    const off = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [])

  const warm = () => { if (!list) loadSuggest().then(setList) }
  const go = (s: Sug) => { setOpen(false); router.push(s[2]) }

  return (
    <div ref={wrap} className="relative flex-1 min-w-0">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (hi >= 0 && items[hi]) { go(items[hi]); return }
          setOpen(false)
          const v = value.trim()
          if (v) onSubmit(v)
        }}
        className="flex gap-2"
      >
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); warm() }}
          // 눌렀을 때는 받아만 둔다 — /search 는 검색어가 든 채 자동 포커스라 열면 결과를 덮는다
          onFocus={warm}
          onKeyDown={(e) => {
            if (!items.length) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % items.length) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h <= 0 ? items.length - 1 : h - 1)) }
            else if (e.key === 'Escape') { setOpen(false) }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="sbx-list"
          aria-autocomplete="list"
          className={inputClassName}
        />
        <button
          type="submit"
          className={onDark ? 'px-3 rounded-[10px] text-[13.5px] font-bold shrink-0' : 'px-4 md:px-5 rounded-[10px] text-[13.5px] font-bold text-white shrink-0'}
          style={onDark ? { background: '#fff', color: '#1428A0' } : { background: '#1428A0' }}
        >
          검색
        </button>
      </form>
      {items.length > 0 && (
        <ul
          id="sbx-list"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-[10px] shadow-lg overflow-hidden"
        >
          {items.map((s, i) => (
            <li
              key={s[0] + i}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => { e.preventDefault(); go(s) }}
              onMouseEnter={() => setHi(i)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-[13.5px] cursor-pointer ${i === hi ? 'bg-blue-50' : ''}`}
            >
              <span className="flex-1 min-w-0 truncate text-[#0b1220]">{s[0]}</span>
              <span className="shrink-0 text-xs text-[#9ca3af]">{MOD_LABEL[s[1]] || ''}</span>
            </li>
          ))}
          <li
            role="option"
            aria-selected={false}
            onMouseDown={(e) => { e.preventDefault(); setOpen(false); const v = value.trim(); if (v) onSubmit(v) }}
            className="px-3.5 py-2 text-xs text-blue-700 bg-gray-50 border-t border-gray-100 cursor-pointer"
          >
            「{value.trim()}」 전체 검색 결과 보기
          </li>
        </ul>
      )}
    </div>
  )
}
