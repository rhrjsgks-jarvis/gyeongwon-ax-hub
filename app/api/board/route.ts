import { NextResponse } from 'next/server'

// 빌드 시점에 정적으로 프리렌더링되면 새 글이 절대 반영되지 않는다 — 매 요청 실행.
export const dynamic = 'force-dynamic'

/*
 * 팀 게시판 프록시 (2026-08-30 사장님 요청 — "별도로 게시판같은걸만들어서")
 *
 * 받는 쪽은 Google Apps Script(`docs/apps-script/Board.gs`) + 시트다 — 이 저장소가
 * 사용 로그·시험 결과에서 쓰는 그 패턴이다. 주소는 `BOARD_GAS_URL` 환경변수에만 둔다
 * (public repo 라 커밋하면 누구나 아무 글이나 밀어 넣을 주소가 공개된다. 화면 소스에도
 * 안 실리게 NEXT_PUBLIC_ 접두를 붙이지 않는다 — 서버 라우트만 안다).
 *
 * 실패를 성공으로 읽지 않는다 — 로그 라우트가 겪은 그 사고("빈 배열도 배열이라
 * 전 항목이 0인 화면") 그대로, `connected` 를 갈라 밝히고 마지막 성공분을 stale 로 내준다.
 */
type Cached = { at: number; posts: unknown[] }
let cache: Cached | null = null
const TTL_MS = 15_000

export async function GET(req: Request) {
  const url = process.env.BOARD_GAS_URL
  if (!url) {
    return NextResponse.json({ posts: [], connected: false, reason: '게시판 시트 미연동 (BOARD_GAS_URL)' })
  }
  /* 글을 막 등록한 화면은 ?fresh=1 로 캐시를 건너뛴다 — 서버리스라 POST 가 비운
   * 캐시와 GET 이 읽는 캐시가 **다른 인스턴스**일 수 있어, 그대로 두면 자기 글이
   * 최대 15초 안 보인다(실측). 글쓴 사람이 "안 됐나?" 하고 다시 누르게 되는 결함이다. */
  const fresh = new URL(req.url).searchParams.has('fresh')
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ posts: cache.posts, connected: true, cached: true })
  }
  const tries = [6000, 8000]
  let lastErr = ''
  for (const ms of tries) {
    try {
      const res = await fetch(`${url}?limit=150`, { cache: 'no-store', signal: AbortSignal.timeout(ms) })
      if (!res.ok) { lastErr = `GAS ${res.status}`; continue }
      const data = await res.json()
      if (!data || data.ok === false) { lastErr = String(data && data.error) || '형식 오류'; continue }
      cache = { at: Date.now(), posts: data.posts || [] }
      return NextResponse.json({ posts: cache.posts, connected: true })
    } catch (e) {
      lastErr = e instanceof Error ? e.name : String(e)
    }
  }
  if (cache) {
    /* 실패했지만 마지막 성공분이 있다 — 빈 화면보다 낡은 목록이 낫고, 낡았다고 밝힌다 */
    return NextResponse.json({ posts: cache.posts, connected: true, stale: true })
  }
  return NextResponse.json({ posts: [], connected: false, reason: lastErr })
}

export async function POST(req: Request) {
  const url = process.env.BOARD_GAS_URL
  if (!url) {
    return NextResponse.json({ ok: false, reason: '게시판 시트 미연동 (BOARD_GAS_URL)' }, { status: 503 })
  }
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, reason: '몸통이 JSON 이 아니다' }, { status: 400 }) }

  /* 길이는 받는 쪽(Board.gs)도 자르지만 여기서 먼저 자른다 — 두 겹이 싸다 */
  const d = body as Record<string, unknown>
  const post = {
    store: String(d.store || '').slice(0, 8),
    storeName: String(d.storeName || '').slice(0, 30),
    author: String(d.author || '').slice(0, 20),
    topic: String(d.topic || '자유').slice(0, 10),
    title: String(d.title || '').slice(0, 80).trim(),
    body: String(d.body || '').slice(0, 2000).trim(),
  }
  if (!post.title || !post.body) {
    return NextResponse.json({ ok: false, reason: '제목과 내용을 적어주세요' }, { status: 400 })
  }

  try {
    const form = new URLSearchParams()
    form.set('data', JSON.stringify(post))
    const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(9000) })
    const out = await res.json().catch(() => null)
    if (res.ok && out && out.ok) {
      cache = null // 방금 쓴 글이 목록에 바로 보이게 — 15초 캐시를 비운다
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, reason: (out && out.error) || `GAS ${res.status}` }, { status: 502 })
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.name : String(e) }, { status: 502 })
  }
}
