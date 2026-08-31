import { NextResponse } from 'next/server'

/*
 * 매장 바이럴 자료를 서버에서 대신 받아 오는 프록시 (2026-08-31).
 *
 * **브라우저에서 `script.google.com` 을 직접 부르면 CORS 로 막힌다** — 사용 로그가
 * `/api/logs` 를 거치는 것과 같은 이유다. 관리자 대시보드는 이 라우트만 부른다.
 *
 * 수집·저장·화면은 전부 Apps Script 쪽에서 끝난다(전산PC 에서 Vercel 이 막혀
 * 그렇게 만들었다). 여기서는 **읽기만** 한다 — 쓰기 경로는 두지 않는다.
 */
export const dynamic = 'force-dynamic'

/* 주소는 공개 링크라 코드에 둔다(시크릿쿠폰·컨시어지가 이미 그렇다).
   네이버 API 키는 그쪽 스크립트 속성에만 있고 이 저장소에는 없다. */
const VIRAL_GAS_URL =
  'https://script.google.com/macros/s/AKfycbyfiNnGIrydVPOOs5BlcsMCgKFtv2EWfWQFjEqU1lZGNFHYoonRW2CTkwOi5-aPG4Q/exec'

/* 관리자 화면은 몇 사람만 보므로 짧은 캐시로 족하다. Apps Script 왕복이
   1~3초라 연속 새로고침을 즉시 응답하는 값어치가 있다(로그 프록시와 같은 판단). */
type Cached = { at: number; body: unknown }
let cache: Cached | null = null
/* **1분에서 5분으로 늘렸다**(2026-08-31). 자료가 6,799건이 되며 Apps Script 왕복이
   **13초**가 됐다 — 그 사이 화면이 멎어 있으므로 캐시가 듣는 시간을 늘리는 값어치가
   커졌다. 수집은 새벽 3시에 한 번 도니 5분이 낡을 일이 없고, 「지금 수집」을 누른
   직후에는 화면이 `?fresh=1` 로 캐시를 건너뛴다. */
const TTL_MS = 5 * 60_000

export async function GET(req: Request) {
  /* 사람이 「다시 시도」를 누른 것은 캐시를 건너뛴다 — 버튼이 약속한 일을 해야 한다 */
  const fresh = new URL(req.url).searchParams.get('fresh') === '1'
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ...(cache.body as object), cached: true })
  }

  /* 한 번 더 두드린다 — Apps Script 는 콜드스타트가 있다(로그 프록시와 같은 이유).

     **8·12초로는 모자랐다**(2026-08-31 실측). 자료가 6,799건이 되며 응답이 **1.01MB ·
     13초**가 됐는데 프록시가 12초에 끊어, Apps Script 는 멀쩡한데 화면이
     「불러오지 못했습니다」를 띄웠다 — **남의 탓으로 보이는 우리 결함**이라 특히 나쁘다.
     20·30초로 둔다. 자료가 더 늘 것을 감안한 여유이고, 첫 요청만 기다리면 그 뒤
     5분은 캐시가 즉시 답한다(Vercel 함수 한도는 300초라 여유가 크다). */
  for (const ms of [20000, 30000]) {
    try {
      const res = await fetch(`${VIRAL_GAS_URL}?json=1`, {
        cache: 'no-store',
        redirect: 'follow',
        signal: AbortSignal.timeout(ms),
      })
      if (!res.ok) continue
      const body = await res.json()
      /* **`ok` 를 보고 판단한다** — Apps Script 가 오류 화면(HTML)을 돌려주면
         JSON 파싱에서 던지지만, 빈 JSON 을 성공으로 읽는 것도 막아야 한다. */
      if (!body || body.ok !== true) continue
      cache = { at: Date.now(), body }
      return NextResponse.json(body)
    } catch {
      /* 다음 시도로 */
    }
  }

  /* **못 받았으면 0 을 내밀지 않는다** — 가진 것이 있으면 낡았다고 밝히고 그것을 준다.
     이 저장소가 로그 파이프라인에서 이미 데인 자리다(실패를 성공으로 읽어 전 항목 0). */
  if (cache) return NextResponse.json({ ...(cache.body as object), stale: true })
  return NextResponse.json({ ok: false, error: 'Apps Script 응답 없음' })
}
