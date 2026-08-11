import { NextResponse } from 'next/server'

// 빌드 시점에 정적으로 프리렌더링되면(env 미설정 분기만 실행돼 응답이 고정됨) 배포 후
// Google Sheets에 새 로그가 쌓여도 절대 반영되지 않으므로, 매 요청마다 실행되도록 강제한다.
export const dynamic = 'force-dynamic'

// 팀 전체 사용 로그를 서버 사이드에서 가져오는 프록시.
// Google Apps Script Web App(doGet)을 서버에서 대신 호출해 브라우저 CORS 이슈를 피한다.
// NEXT_PUBLIC_GAS_URL이 설정돼 있지 않으면(=아직 구글 시트 연동 전) 빈 배열을 반환한다.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_GAS_URL

  if (!url) {
    return NextResponse.json({ logs: [], connected: false })
  }

  try {
    /* 기간을 좁혀 읽는다 — 대시보드는 14일치를 그리는데 시트 전체를 읽으면
       매장이 늘수록 느려져 결국 8초 타임아웃에 걸린다(실측 3.9초에서 출발했다).
       옛 Apps Script 는 days 를 모르지만 그냥 무시하므로 안전하다. */
    const res = await fetch(`${url}?days=60`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      return NextResponse.json({ logs: [], connected: false, error: `GAS ${res.status}` })
    }
    const data = await res.json()
    return NextResponse.json({ logs: Array.isArray(data.logs) ? data.logs : [], connected: true })
  } catch (err) {
    return NextResponse.json({ logs: [], connected: false, error: String(err) })
  }
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
