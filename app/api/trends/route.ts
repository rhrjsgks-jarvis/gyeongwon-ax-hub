import { NextResponse } from 'next/server'
import { pickTrends } from '@/lib/trends'
import type { LogEvent } from '@/lib/logEvent'
import { normalizeLogs } from '@/lib/logEvent'

export const dynamic = 'force-dynamic'

/**
 * **지금 팀이 많이 찾는 것 — 집계만 내려보낸다.**
 *
 * `/api/logs` 를 그대로 쓰지 않는 이유가 이 파일의 전부다. 그쪽은 60일 원본이라
 * 실측 **674KB · 4,495줄 · 왕복 3.6~4.2초**다(관리자가 하루 몇 번 여는 화면이라 그게 맞다).
 * 이 목록은 **매장 폰이 허브를 열 때마다** 보는 것이라 같은 것을 받으면 안 된다 —
 * 이 저장소가 첫 화면 속도에서 계속 경계해 온 그 지점이다. 여기서 집계해 **1KB 남짓**만 준다.
 *
 * 그리고 **원본을 밖으로 내보내지 않는다.** 허브는 로그인 없는 공개 주소다.
 * 나가는 것은 도구 이름·검색어·건수뿐이고 `uid`·`store`·`ts` 는 나가지 않는다.
 */
type Cached = { at: number; body: unknown }
let cache: Cached | null = null
/* 「오늘」기준이라 낡으면 곤란하지만, 상담 한 건이 순위를 뒤집지는 않는다.
   3분이면 GAS 호출이 하루 수백 회를 넘지 않으면서 화면은 충분히 최신이다. */
const TTL_MS = 180_000

export async function GET() {
  const url = process.env.NEXT_PUBLIC_GAS_URL
  if (!url) return NextResponse.json({ ok: false, reason: 'GAS 미연동' })

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ...(cache.body as object), cached: true })
  }

  /* **8일치만 받는다.** 창이 최대 7일이라 그 이상은 받아도 버린다 —
     `/api/logs` 가 60일을 받아 느려진 것과 같은 실수를 되풀이하지 않는다.
     옛 Apps Script 는 days 를 모르지만 그냥 무시하므로 안전하다. */
  for (const ms of [6000, 8000]) {
    try {
      const res = await fetch(`${url}?days=8`, { cache: 'no-store', signal: AbortSignal.timeout(ms) })
      if (!res.ok) continue
      const data = await res.json()
      /* 시트가 보내는 `date` 는 `'Wed Jul 29 2026 …'` 꼴이고 헤더 행도 섞여 온다.
         `normalizeLogs` 가 그것을 바로잡는다 — 대시보드와 **같은 함수**를 타야
         두 화면이 같은 로그를 보고 다른 말을 하지 않는다. */
      const logs = normalizeLogs(Array.isArray(data.logs) ? data.logs : []) as LogEvent[]
      const t = pickTrends(logs)
      const body = { ok: true, window: t.window, tools: t.tools, keywords: t.keywords }
      cache = { at: Date.now(), body }
      return NextResponse.json(body)
    } catch { /* 다음 시도 */ }
  }

  /* 못 받았다. **빈 목록을 성공으로 내밀지 않는다** — 가진 것이 있으면 낡았다고 밝히고 준다.
     `/api/logs` 가 「빈 배열도 배열이라 클라이언트가 성공으로 읽어 전 항목이 0인 화면을
     그렸다」는 사고를 겪은 그대로다. 없으면 `ok:false` 라 화면이 아예 안 뜬다. */
  if (cache) return NextResponse.json({ ...(cache.body as object), stale: true })
  return NextResponse.json({ ok: false, reason: '집계 실패' })
}
