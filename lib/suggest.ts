/*
 * 통합검색 자동완성 순위 — 브라우저 없이 검사할 수 있게 화면(SearchBox)에서 뺐다.
 *
 * ★ 최상위 규칙(2026-10-22 사장님): 세일즈 코파일럿의 모든 정보는 검색창 자동완성으로 찾을 수 있어야 한다.
 *   그래서 제목만이 아니라 **대표 낱말(넷째 칸, 색인 kw 에서 제목에 없는 낱말)** 로도 걸린다 —
 *   「헤파 필터」 「DB94-07195F」 처럼 칸 안의 품명·부품번호를 쳐도 그 칸이 떠야 한다.
 *
 * 순서: 제목 앞이 맞음 → 제목 낱말 앞 → 제목 어디든 → 친 낱말이 제목에 모두 → **대표 낱말까지 합쳐 모두**.
 * 같으면 짧은 제목 먼저. 제목으로 걸린 것이 늘 위에 선다 — 대표 낱말은 빈자리를 채운다.
 */
export type Sug = [string, string, string, string?]   // [제목, 모듈, 주소, 대표 낱말]

export const SUGGEST_MAX = 8
export const sugNorm = (s: string) => s.toLowerCase().replace(/[\s·,()/\-]/g, '')

/* 대표 낱말은 길어서 매번 정규화하면 느리다 — 목록 배열마다 한 번만 */
const normCache = new WeakMap<Sug[], string[]>()

export function rankSuggest(list: Sug[], q: string, max = SUGGEST_MAX): Sug[] {
  const nq = sugNorm(q)
  if (!nq) return []
  const words = q.toLowerCase().split(/\s+/).map(sugNorm).filter(Boolean)
  let keys = normCache.get(list)
  if (!keys) { keys = list.map((s) => sugNorm(s[3] || '')); normCache.set(list, keys) }
  const scored: [number, Sug][] = []
  list.forEach((s, i) => {
    const t = s[0].toLowerCase()
    const nt = sugNorm(t)
    let sc = -1
    if (nt.startsWith(nq)) sc = 0
    else if (t.split(/[\s·,()/]+/).some((w) => sugNorm(w).startsWith(nq))) sc = 1
    else if (nt.includes(nq)) sc = 2
    else if (words.length > 1 && words.every((w) => nt.includes(w))) sc = 3
    else if (words.every((w) => nt.includes(w) || keys![i].includes(w))) sc = 4
    if (sc >= 0) scored.push([sc, s])
  })
  scored.sort((a, b) => a[0] - b[0] || a[1][0].length - b[1][0].length)
  /* 대표 낱말로만 걸린 것은 **앱마다 돌아가며** 고른다. 그냥 짧은 제목 순이면 「토너」·「헤파 필터」 에서 모델파인더
     제품 수십 개가 여덟 자리를 다 먹고 AS 소모품가 칸은 영영 안 뜬다 — 앱마다 가장 맞는 것이 한 자리씩 먼저 선다. */
  const byTitle = scored.filter((x) => x[0] < 4).map((x) => x[1])
  const rest = scored.filter((x) => x[0] === 4).map((x) => x[1])
  const queues = new Map<string, Sug[]>()
  for (const r of rest) { if (!queues.has(r[1])) queues.set(r[1], []); queues.get(r[1])!.push(r) }
  const mixed: Sug[] = []
  const qs = Array.from(queues.values())
  while (mixed.length < rest.length) qs.forEach((q) => { const r = q.shift(); if (r) mixed.push(r) })
  return [...byTitle, ...mixed].slice(0, max)
}
