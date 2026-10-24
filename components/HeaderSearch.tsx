'use client'

/*
 * 헤더 통합검색 — **세일즈 코파일럿의 검색은 이것 하나다**(2026-10-23 사장님:
 * *"통합검색이 모든 검색기능을 통합하여 세일즈코파일럿 내 모든 검색을 한곳에서 할 수 있게 하고
 * 검색창은 항상 최상단에 위치시킨다"*).
 *
 * - 모든 화면의 맨 위(헤더)에 있다. 허브(/)와 /search 는 본문 맨 위에 같은 칸(SearchBox)이 크게 있어
 *   헤더에서는 감춘다 — 한 화면에 검색칸이 둘이면 다시 중복이다.
 * - 미니앱 안의 검색칸(모델파인더·AS·설치환경·설치비용)은 허브 안에서 감춘다(`ax-embed`).
 *   그 앱들의 자료는 전부 통합검색 색인·자동완성에 들어 있다(최상위 규칙).
 * - 좁은 화면(폰, 720px 미만)은 헤더에 자리가 없어 그리지 않는다 — 아래 탭 「통합검색」이 그 길이다
 *   (돋보기 단추를 넣었더니 390px 에서 삼성 워드마크를 덮었다).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SearchBox from './SearchBox'

export default function HeaderSearch({ wide }: { wide: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  if (!wide) {
    return (
      <button
        type="button"
        onClick={() => router.push('/search')}
        aria-label="통합검색"
        title="통합검색"
        className="flex items-center justify-center rounded-full text-white shrink-0"
        style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.18)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l4.5 4.5" />
        </svg>
      </button>
    )
  }
  return (
    <div className="flex-1 min-w-0 max-w-[560px] mx-3" data-header-search>
      <SearchBox
        value={q}
        onChange={setQ}
        onSubmit={(v) => { router.push(`/search?q=${encodeURIComponent(v)}`); setQ('') }}
        placeholder="통합검색 — 제품·모델코드·AS·설치·요금 무엇이든"
        onDark
        inputClassName="flex-1 min-w-0 rounded-[10px] px-3 py-1.5 text-[13.5px] bg-white text-[#0b1220] border-0 focus:outline-none"
      />
    </div>
  )
}
