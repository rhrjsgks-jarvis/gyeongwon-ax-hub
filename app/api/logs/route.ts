import { NextResponse } from 'next/server'

// 빌드 시점에 정적으로 프리렌더링되면(env 미설정 분기만 실행돼 응답이 고정됨) 배포 후
// Google Sheets에 새 로그가 쌓여도 절대 반영되지 않으므로, 매 요청마다 실행되도록 강제한다.
export const dynamic = 'force-dynamic'

/* 마지막으로 성공한 응답을 함수 인스턴스에 들고 있는다.
 *
 * **왜 필요한가 — 대시보드가 「새로고침을 수차례 해야 숫자가 나온다」는 신고**(2026-08-26 사장님).
 * 원인은 느림이 아니라 **실패를 성공으로 읽는 것**이었다. Apps Script 왕복이 실측
 * **3.6~4.2초**(4,219줄 · 622KB)라 콜드스타트가 겹치면 8초를 넘고, 그때 이 라우트가
 * `logs: []` 를 돌려주는데 **빈 배열도 배열이라** 클라이언트가 성공으로 읽어
 * **전 항목이 0인 화면**을 그렸다. 몇 번 새로고침하면 따뜻해져 숫자가 나온다.
 *
 * 그래서 셋을 함께 고친다:
 *   ① 마지막 성공분을 캐시해 두고 **실패하면 그것을 stale 로 내준다**(0 보다 낫다)
 *   ② 아주 짧은 TTL 로 연속 새로고침을 즉시 응답한다 — GAS 호출 수도 준다
 *   ③ 실패를 **`connected:false` 로 분명히 밝힌다** — 클라이언트가 갈라 읽는다
 *
 * 서버리스라 인스턴스마다 따로 데워지지만, 그래도 **같은 인스턴스로 다시 들어오면
 * 즉시** 나간다. 사용량 대시보드라 30초 낡아도 아무 문제가 없다. */
type Cached = { at: number; logs: unknown[] }
let cache: Cached | null = null
const TTL_MS = 30_000

// 팀 전체 사용 로그를 서버 사이드에서 가져오는 프록시.
// Google Apps Script Web App(doGet)을 서버에서 대신 호출해 브라우저 CORS 이슈를 피한다.
// NEXT_PUBLIC_GAS_URL이 설정돼 있지 않으면(=아직 구글 시트 연동 전) 빈 배열을 반환한다.
export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_GAS_URL

  if (!url) {
    return NextResponse.json({ logs: [], connected: false, reason: 'GAS 미연동' })
  }

  /* **사람이 「새로 고침」을 누른 것은 캐시를 건너뛴다**(2026-08-31 사장님 요청 —
   * *"새로고침버튼을 만들어서 시간이 반영된 값을 보고싶다"*).
   *
   * 자동 로드는 캐시를 그대로 쓴다 — GAS 는 하루 실행시간 90분이 한도라 화면이
   * 뜰 때마다 두드리면 매장이 늘수록 그 한도를 먹는다. 하지만 **버튼은 누른 사람이
   * 방금 것을 원한다는 뜻**이고, 관리자 대시보드는 몇 사람만 보는 화면이라 그 비용이
   * 무시할 만하다. 버튼이 약속한 일을 실제로 하지 않으면 사장님이 **여러 번 누르게
   * 되고**(2026-08-26 에 이미 겪은 그 일이다) 결국 호출 수는 오히려 는다. */
  const fresh = new URL(req.url).searchParams.get('fresh') === '1'

  if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ logs: cache.logs, connected: true, cached: true })
  }

  /* 한 번 더 두드린다 — 콜드스타트는 대개 첫 번에만 느리다. 9초씩 두 번은
     Vercel 함수 한도를 넘으므로 **첫 번 6초 · 재시도 8초**로 잡는다. */
  const tries = [6000, 8000]
  let lastErr = ''
  for (const ms of tries) {
    try {
      /* 기간을 좁혀 읽는다 — 대시보드는 14일치를 그리는데 시트 전체를 읽으면
         매장이 늘수록 느려져 결국 타임아웃에 걸린다(실측 3.9초에서 출발했다).
         옛 Apps Script 는 days 를 모르지만 그냥 무시하므로 안전하다. */
      const res = await fetch(`${url}?days=60`, { cache: 'no-store', signal: AbortSignal.timeout(ms) })
      if (!res.ok) { lastErr = `GAS ${res.status}`; continue }
      const data = await res.json()
      const logs = Array.isArray(data.logs) ? data.logs : []
      cache = { at: Date.now(), logs }
      return NextResponse.json({ logs, connected: true })
    } catch (err) {
      lastErr = String(err)
    }
  }

  /* 끝내 못 받았다. **0 을 내밀지 않는다** — 가진 것이 있으면 낡았다고 밝히고 그것을 준다. */
  if (cache) {
    return NextResponse.json({ logs: cache.logs, connected: true, stale: true, error: lastErr })
  }
  return NextResponse.json({ logs: [], connected: false, error: lastErr })
}

/**
 * 사용 로그 배치를 Apps Script 로 넘긴다.
 *
 * 브라우저가 GAS 로 곧장 쏘던 것을 여기로 돌린 이유는 **성공 여부를 알기 위해서**다.
 * 직접 호출은 CORS 때문에 `mode:'no-cors'` 를 써야 했고, 그러면 응답을 읽을 수 없어
 * 한도를 넘겨 실패해도 아무도 몰랐다(그래서 재시도도 못 했다). 서버에서 부르면 CORS 가
 * 없으므로 GAS 의 실제 응답을 그대로 클라이언트에 돌려줄 수 있다.
 *
 * 배치라서 함수 호출 수는 이벤트 수의 1/20 이다 — 하루 6천 건이어도 300회 남짓이다.
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_GAS_URL
  if (!url) return NextResponse.json({ ok: false, error: 'GAS 미연동' }, { status: 503 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: '본문 파싱 실패' }, { status: 400 }) }

  const { batchId, events } = (body || {}) as { batchId?: string; events?: unknown[] }
  if (!Array.isArray(events) || !events.length) {
    return NextResponse.json({ ok: false, error: 'events 가 비어 있음' }, { status: 400 })
  }
  /* 한 번에 넘기는 양을 서버에서도 막는다 — 클라이언트를 믿고 열어 두면
     누가 큰 배열을 던졌을 때 Apps Script 실행시간을 통째로 태운다. */
  if (events.length > 100) {
    return NextResponse.json({ ok: false, error: '한 배치는 100건까지' }, { status: 413 })
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, events }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return NextResponse.json({ ok: false, error: `GAS ${res.status}` }, { status: 502 })
    const data = await res.json().catch(() => null)
    /* GAS 가 ok:false 를 주면 그대로 전한다 — 클라이언트가 대기함에 남겨 다시 보낸다 */
    if (!data || data.ok !== true) {
      return NextResponse.json({ ok: false, error: (data && data.error) || 'GAS 응답 이상' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, saved: data.saved ?? events.length, duplicate: !!data.duplicate })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 })
  }
}
