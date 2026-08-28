'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TrendWindow, ToolTrend, KeywordTrend } from '@/lib/trends'

/**
 * **지금 팀이 많이 찾는 것**(2026-08-28 사장님 요청) — 통합검색창 바로 아래.
 *
 * 두 줄이다. 위가 **검색어**(눌러서 바로 검색), 아래가 **도구**(눌러서 바로 열기).
 * 순위 번호만 적고 건수는 적지 않는다 — `냉장고 9` 는 *9명*인지 *9위*인지 헷갈리고,
 * 상담사가 몇 초 만에 훑는 자리라 숫자가 늘어나면 읽히지 않는다(건수는 관리자
 * 대시보드가 볼 자리다).
 *
 * **없으면 아예 안 그린다.** 한두 줄짜리 목록은 없느니만 못하다.
 */
const MIN_SHOW = 3

type Payload = {
  ok?: boolean
  window?: TrendWindow
  tools?: ToolTrend[]
  keywords?: KeywordTrend[]
}

const WINDOW_LABEL: Record<TrendWindow, string> = {
  today: '오늘 기준',
  /* **조용히 넓히지 않는다.** 오늘 자료가 얇으면(실측: 하루 첫 기록이 08~10시라
     아침엔 늘 얇다) 최근 7일로 넓히는데, 화면이 그 사실을 적어야 한다 —
     제품 상세검색이 `P.notes` 에 넓힌 사실을 적는 것과 같은 규칙이다. */
  week: '최근 7일 기준',
}

/**
 * 칩 하나. **번호 원은 상위 3위까지만** 붙인다.
 *
 * 열 개에 다 붙였더니 폰(390px)에서 검색어가 **네 줄**이 되어 위젯이 216px 을 먹었고,
 * 허브 첫 섹션이 y=800(화면 844px)까지 밀려 **작은 폰에서는 도구 카드가 화면 밖으로
 * 나간다**. 이 저장소가 좁은 화면에서 안내문을 숨기고 도구막대를 196→101px 로 줄인 것과
 * 같은 판단이다 — **위를 비우고 아래를 채운다.**
 *
 * 순위는 번호가 아니라 **놓인 차례**가 말한다(왼쪽에서 오른쪽, 위에서 아래).
 * 상위 셋만 번호와 색으로 세워 두면 "베스트"라는 것이 한눈에 읽히면서 자리도 아낀다.
 */
function Chip({ rank, label, onClick }: { rank: number; label: string; onClick: () => void }) {
  const hot = rank <= 3
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full ${hot ? 'pl-1.5' : 'pl-2.5'} pr-2.5 py-1 text-xs border shrink-0 max-w-full`}
      style={{
        background: hot ? '#EEF2FF' : '#fff',
        borderColor: hot ? '#C7D2FE' : '#E5E7EB',
        color: hot ? '#1428A0' : '#374151',
      }}
    >
      {hot && (
        <span
          className="inline-flex items-center justify-center rounded-full font-bold shrink-0"
          style={{ width: 16, height: 16, fontSize: 10, background: '#1428A0', color: '#fff' }}
        >
          {rank}
        </span>
      )}
      <span className="truncate font-medium">{label}</span>
    </button>
  )
}

export default function SearchTrends() {
  const router = useRouter()
  const [data, setData] = useState<Payload | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/trends')
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d) })
      .catch(() => { /* 못 받으면 안 그린다 — 상담을 막는 것이 아니다 */ })
    return () => { alive = false }
  }, [])

  if (!data || !data.ok) return null
  const keywords = data.keywords || []
  const tools = data.tools || []
  if (keywords.length < MIN_SHOW && tools.length < MIN_SHOW) return null

  return (
    <div className="-mt-3 mb-6 rounded-xl border border-gray-100 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold" style={{ color: '#1428A0' }}>지금 많이 찾는 것</span>
        <span className="text-[11px] text-gray-400">{WINDOW_LABEL[data.window || 'week']}</span>
      </div>

      {keywords.length >= MIN_SHOW && (
        <Row label="검색어" mode="wrap">
          {keywords.map((k: KeywordTrend, i) => (
            <Chip
              key={k.q}
              rank={i + 1}
              label={k.q}
              /* **`from=trend` 를 붙이는 이유 — 자기강화 고리를 끊는다.**
                 칩을 눌러 들어간 검색까지 로그로 세면 그 말이 더 위로 올라가고,
                 며칠이면 목록이 굳어 "지금 많이 찾는 것"이 아니라 "어제 1위"가 된다.
                 `/search` 가 이 표시를 보고 그 검색을 세지 않는다. */
              onClick={() => router.push(`/search?q=${encodeURIComponent(k.q)}&from=trend`)}
            />
          ))}
        </Row>
      )}

      {tools.length >= MIN_SHOW && (
        <Row label="도구" mode="scroll">
          {tools.map((t: ToolTrend, i) => (
            <Chip key={t.module} rank={i + 1} label={t.label} onClick={() => router.push(t.href)} />
          ))}
        </Row>
      )}
    </div>
  )
}

/**
 * 한 줄 = 이름표 + 칩들. **두 줄의 모양이 다르다** — 실물을 찍어 보고 갈랐다.
 *
 * 폰(390px)에서 한 줄로 흘렸더니 **10개 중 3개만 보이고 나머지는 잘렸다.** 「베스트10」인데
 * 옆으로 밀 줄 모르는 상담사에게는 3개짜리 목록이다 — 이 저장소가 배치 시뮬레이터에서
 * 겪은 *"화면에 있는데 안 보이는 것은 없는 것"* 과 같다.
 *
 *  - **검색어(`wrap`)** — 이 기능의 주인공이고 말이 짧아(냉장고·쿠폰) 줄바꿈해도
 *    폰에서 세 줄이면 10개가 다 보인다. **10개를 다 보여주는 것이 요구사항이다.**
 *  - **도구(`scroll`)** — 이름이 길어(`제품별 설치환경 가이드`) 줄바꿈하면 폰에서
 *    다섯 줄이 되어 검색창 아래를 통째로 밀어낸다. 가로로 흘리고 **오른쪽에 옅은 그늘**을
 *    두어 더 있다는 것을 알린다(신호가 없으면 잘린 것이 우연처럼 보인다).
 *    이름을 줄이지 않는 이유는 **앱 안의 정식 명칭이 기준**이라는 규칙 때문이다.
 */
function Row({ label, mode, children }: { label: string; mode: 'wrap' | 'scroll'; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="text-[11px] text-gray-400 w-9 shrink-0 leading-6">{label}</span>
      {mode === 'wrap' ? (
        <div className="flex flex-wrap gap-1.5 py-0.5">{children}</div>
      ) : (
        <div className="relative min-w-0 flex-1">
          <div className="flex gap-1.5 overflow-x-auto py-0.5" style={{ scrollbarWidth: 'none' }}>
            {children}
          </div>
          {/* 더 있다는 신호 — 손가락을 받지 않아야 칩을 가리지 않는다 */}
          <div
            className="absolute right-0 top-0 bottom-0 w-6 pointer-events-none"
            style={{ background: 'linear-gradient(to right, rgba(255,255,255,0), #fff)' }}
          />
        </div>
      )}
    </div>
  )
}
