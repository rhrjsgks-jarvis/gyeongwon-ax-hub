import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'

// 비밀번호 해시를 서버에만 두고 검증 결과(true/false)만 클라이언트에 돌려준다.
// 이전에는 클라이언트 번들에 해시가 그대로 노출되어 페이지 소스로 오프라인 대입공격이
// 가능했다.
//
// 해시는 환경변수 ADMIN_PW_HASH(서버 전용 — NEXT_PUBLIC_ 접두사를 붙이지 말 것)로 주입한다.
// 이 저장소는 public이라 해시를 소스에 두면 누구나 받아 오프라인에서 대입할 수 있다.
// 환경변수가 없으면 기존 해시로 폴백해 배포가 끊기지 않게 하되 경고를 남긴다 —
// Vercel 환경변수에 ADMIN_PW_HASH를 등록하고 비밀번호를 새로 바꾸는 것이 최종 상태다.
export const dynamic = 'force-dynamic'

const FALLBACK_HASH = '60fe74406e7f353ed979f350f2fbb6a2e8690a5fa7d1b0c32983d1d8b3f95f67'
const ADMIN_PW_HASH = process.env.ADMIN_PW_HASH || FALLBACK_HASH

if (!process.env.ADMIN_PW_HASH && process.env.NODE_ENV === 'production') {
  console.warn(
    '[admin-auth] ADMIN_PW_HASH 미설정 — public 저장소에 있는 폴백 해시를 쓰는 중입니다. ' +
    'Vercel 환경변수에 ADMIN_PW_HASH를 등록하고 비밀번호를 교체하세요.'
  )
}

// 같은 IP에서 짧은 시간에 반복 시도하는 것을 막는다. 서버 API라 자동화 대입이 가능한데
// 지금까지 아무 제한이 없었다. 인스턴스 메모리 기반이라 완벽하진 않지만(서버리스는 인스턴스가
// 여러 개일 수 있다) 한 기기에서의 무차별 대입은 실질적으로 막힌다.
const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 10
const attempts = new Map<string, { count: number; first: number }>()

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

function rateLimited(key: string): boolean {
  const now = Date.now()
  const rec = attempts.get(key)
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now })
    return false
  }
  rec.count += 1
  return rec.count > MAX_ATTEMPTS
}

// 문자열 === 비교는 첫 불일치 위치에서 즉시 끝나 소요 시간이 "정답과 몇 글자나 같은지"에
// 비례한다. 길이가 같은 해시끼리 상수 시간으로 비교한다.
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export async function POST(req: Request) {
  const key = clientKey(req)
  if (rateLimited(key)) {
    return NextResponse.json(
      { ok: false, error: 'too_many_attempts', retryAfterMinutes: Math.ceil(WINDOW_MS / 60000) },
      { status: 429 }
    )
  }

  const { password } = await req.json().catch(() => ({ password: '' }))
  const hash = createHash('sha256').update(String(password || '')).digest('hex')
  const ok = safeEqual(hash, ADMIN_PW_HASH)
  if (ok) attempts.delete(key)
  return NextResponse.json({ ok })
}
