/**
 * 세일즈 코파일럿 — **지금 팀이 많이 찾는 것**(2026-08-28 사장님 요청)
 *
 * *"통합검색창에 현재 키워드 베스트10이 노출되면 좋겠습니다. 현재 가장 많이 보는 곳,
 * 현재 가장 많이 검색한 곳."*
 *
 * 이 파일은 **순수 집계 함수만** 둔다(DOM·fetch 없음). 이유가 둘이다 —
 *  ① `app/api/trends` 가 서버에서 이것을 돌려 **몇 KB 만** 내려보낸다. 원본 로그는
 *     실측 **674KB · 왕복 3.6~4.2초**라(관리자 대시보드가 그래서 캐시를 둔다) 매장 폰이
 *     허브를 열 때마다 받을 물건이 아니다.
 *  ② `scripts/test-trends.mjs` 가 `--experimental-strip-types` 로 직접 import 해
 *     검사한다(`lib/logEvent.ts` 를 `test-admin.mjs` 가 그렇게 검사하는 것과 같은 방식).
 */

import { normalize } from './searchTerms.ts'
import type { LogEvent } from './logEvent.ts'

/* ── 도구 이름·주소 ───────────────────────────────────────────────
 * **여기 적힌 이름은 허브 카드 제목과 같아야 한다.** 이 저장소가 허브 카드 개수·앱
 * 버전·비교표 값에서 반복해 데인 그 종류라(같은 것을 두 곳에 적으면 어긋난다),
 * `test-trends.mjs` 가 `app/page.tsx` 의 카드 제목·주소와 **전수 대조**한다.
 *
 * 관리자 대시보드의 `MODULE_META` 를 가져다 쓰지 않는 이유: 그쪽은 `finder` 를
 * '통합검색'이라 적고 있는데 지금 통합검색은 `/search` 이고 `/finder` 는 '모델파인더'다.
 * 상담사가 보는 화면이라 **앱 안의 정식 명칭**을 따른다.
 *
 * 운영이 끝난 모듈(`planner`·`compareInstant`)과 진입점(`hub`)은 여기 없다 —
 * 없는 모듈은 순위에서 통째로 빠진다.
 */
export const TOOL_INFO: Record<string, { label: string; href: string; icon: string }> = {
  finder:      { label: '모델파인더',            href: '/finder',       icon: 'finder' },
  care:        { label: 'AI구독 케어 안내',      href: '/care',         icon: 'care' },
  compare:     { label: '타사비교 세일즈가이드', href: '/compare',      icon: 'compare' },
  catalog:     { label: '모바일 카탈로그',       href: '/#tools',       icon: 'catalog' },
  install:     { label: '제품별 설치환경 가이드', href: '/install',     icon: 'install' },
  as:          { label: 'AS 관련 정보',          href: '/as',           icon: 'warranty' },
  installcost: { label: '설치비용 · 사전준비',   href: '/install-cost', icon: 'bolt' },
  test:        { label: '레벨업 챌린지',         href: '/test',         icon: 'quiz' },
  quiz:        { label: 'URL 퀴즈 생성기',       href: '/quiz',         icon: 'target' },
  place:       { label: '가전 배치 시뮬레이터',  href: '/place',        icon: 'place' },
  concierge:   { label: '컨시어지 프로그램',     href: '/#concierge',   icon: 'ticket' },
  poster:      { label: '컨시어지 접수 포스터',  href: '/poster',       icon: 'printer' },
  coupon:      { label: '시크릿쿠폰',            href: '/#coupon',      icon: 'coupon' },
}

export type TrendWindow = 'today' | 'week'
export interface ToolTrend { module: string; label: string; href: string; icon: string; n: number }
export interface KeywordTrend { q: string; n: number }
export interface Trends {
  window: TrendWindow
  since: number
  tools: ToolTrend[]
  keywords: KeywordTrend[]
}

export const TOP_N = 10
/** 이보다 적으면 '오늘'로는 목록이 빈다 → 최근 7일로 넓힌다. 아래 `pickTrends` 참고. */
export const ENOUGH = 5
const WEEK_DAYS = 7

/** KST 자정(ms). 로그의 `date` 가 KST 기준이라 창도 같은 시간대로 잡는다. */
export function kstDayStart(now = Date.now()): number {
  const shifted = now + 9 * 3_600_000
  return shifted - (shifted % 86_400_000) - 9 * 3_600_000
}

/*
 * **화면에 내보내지 않는 검색어.**
 *
 * 검색어는 상담사가 직접 친 자유 문자열이고, 이 목록은 **전 매장 허브 첫 화면**에 뜬다.
 * 실수로 친 전화번호·이메일이 그대로 팀 전체에 방송되면 안 된다(이 저장소가 AS 연락처·
 * 서비스센터 자료에서 지켜 온 규칙과 같다). 그리고 **한 글자는 조건으로 쓰지 않는다** —
 * 통합검색이 이미 같은 이유로 막아 둔 규칙이다.
 */
const PHONE_RE = /(^|[^0-9])0\d{1,2}[-. ]?\d{3,4}[-. ]?\d{4}([^0-9]|$)/
const LONG_DIGITS_RE = /\d{7,}/
function isPublishable(q: string): boolean {
  if (q.length < 2 || q.length > 40) return false
  if (q.includes('@')) return false
  if (PHONE_RE.test(q)) return false
  if (LONG_DIGITS_RE.test(q)) return false
  return true
}

/**
 * **도구 순위 — 세션 수로 센다.**
 *
 * 원문 그대로 세면 *"무엇을 많이 보는가"* 가 아니라 *"누가 많이 눌렀는가"* 가 된다
 * (`logEvent.ts` 의 `logOnce` 주석이 같은 이유로 세워진 규칙이다). 실측으로 순위가
 * 실제로 바뀐다 — 최근 7일에서 쿠폰은 여러 사람이 한 번씩 열고 타사비교는 몇 사람이
 * 여러 번 열어, 세션으로 세면 쿠폰이 타사비교 위로 올라온다.
 */
export function topTools(logs: LogEvent[], since: number, top = TOP_N): ToolTrend[] {
  const seen: Record<string, Set<string>> = {}
  for (const ev of logs) {
    if (ev.ts < since) continue
    if (ev.action !== 'page_view') continue
    const info = TOOL_INFO[ev.module]
    if (!info) continue                       // 허브 진입·운영 종료 모듈은 세지 않는다
    ;(seen[ev.module] = seen[ev.module] || new Set()).add(ev.uid || String(ev.ts))
  }
  return Object.entries(seen)
    .map(([module, s]) => ({ module, ...TOOL_INFO[module], n: s.size }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, top)
}

/**
 * **검색어 순위 — 세션 수로 세고, 화면에는 가장 많이 쓰인 원래 표기를 적는다.**
 *
 * 모델코드를 치는 대소문자가 사람마다 다르다(실측 `Wd90h25`·`Cc99`·`WF80H24ADW`·
 * `Rz38c9891apg`). 통합검색이 쓰는 `normalize()` 로 눌러 세지 않으면 같은 말이
 * 여러 줄로 갈린다. 다만 **눌린 형태를 화면에 적으면 안 된다** — 사람이 친 말이
 * 아니다(제품 상세검색이 조사 제거로 깎인 말을 안내 문구에 적지 않는 것과 같은 규칙).
 */
export function topKeywords(logs: LogEvent[], since: number, top = TOP_N): KeywordTrend[] {
  const map: Record<string, { uids: Set<string>; forms: Record<string, number> }> = {}
  for (const ev of logs) {
    if (ev.ts < since) continue
    if (ev.module !== 'hub' || ev.action !== 'search') continue
    const raw = String(ev.extra || '').trim()
    if (!isPublishable(raw)) continue
    const key = normalize(raw)
    if (!key) continue
    const slot = (map[key] = map[key] || { uids: new Set(), forms: {} })
    slot.uids.add(ev.uid || String(ev.ts))
    slot.forms[raw] = (slot.forms[raw] || 0) + 1
  }
  return Object.entries(map)
    .map(([key, v]) => ({
      // 같은 횟수면 어느 표기가 뽑힐지 흔들리므로 **표기 자체로도 줄을 세워** 결정적으로 만든다
      q: Object.entries(v.forms).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      n: v.uids.size,
      key,
    }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
    .slice(0, top)
    .map(({ q, n }) => ({ q, n }))
}

/**
 * **오늘을 먼저 보고, 모자라면 최근 7일로 넓힌다.**
 *
 * 사장님이 고른 기준은 「오늘」이다. 그런데 실측으로 **하루 첫 기록이 08~10시**이고
 * 조건(도구 5 · 키워드 5)을 넘는 시각이 대개 **10~12시**(늦으면 17~18시)라,
 * 오늘만 보면 **아침에 여는 상담사는 매일 빈 상자를 본다**. 12일 중 하루(8/25)는
 * 종일 못 채웠다.
 *
 * 그래서 넓히되 **조용히 넓히지 않는다** — `window` 를 함께 돌려주고 화면이
 * `오늘` / `최근 7일` 을 적는다. 제품 상세검색이 평형 매칭 0건일 때 '이상'으로 넓혀
 * 찾고 `P.notes` 에 그 사실을 적는 것과 같은 규칙이다.
 */
export function pickTrends(logs: LogEvent[], now = Date.now(), top = TOP_N): Trends {
  const today = kstDayStart(now)
  const tTools = topTools(logs, today, top)
  const tKeys = topKeywords(logs, today, top)
  if (tTools.length >= ENOUGH && tKeys.length >= ENOUGH) {
    return { window: 'today', since: today, tools: tTools, keywords: tKeys }
  }
  const week = now - WEEK_DAYS * 86_400_000
  return {
    window: 'week',
    since: week,
    tools: topTools(logs, week, top),
    keywords: topKeywords(logs, week, top),
  }
}
