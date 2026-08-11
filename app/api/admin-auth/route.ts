import { NextResponse } from 'next/server'
import { verify, configWarning } from '@/lib/adminAuth'

// 비밀번호를 서버에만 두고 검증 결과(true/false)만 클라이언트에 돌려준다.
// 이전에는 클라이언트 번들에 해시가 그대로 노출되어 페이지 소스로 오프라인 대입공격이
// 가능했다.
//
// 비밀번호는 환경변수로 준다 — ADMIN_PW(평문) 또는 ADMIN_PW_HASH(SHA-256).
// 둘 다 서버 전용이므로 NEXT_PUBLIC_ 접두사를 붙이지 말 것.
// 결정 규칙과 정리(공백·따옴표·대문자) 규칙은 lib/adminAuth.ts 에 있고 테스트가 지킨다.
export const dynamic = 'force-dynamic'

if (process.env.NODE_ENV === 'production') {
  const w = configWarning(process.env)
  if (w) console.warn(w)
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

export async function POST(req: Request) {
  const key = clientKey(req)
  if (rateLimited(key)) {
    return NextResponse.json(
      { ok: false, error: 'too_many_attempts', retryAfterMinutes: Math.ceil(WINDOW_MS / 60000) },
      { status: 429 }
    )
  }

  const { password } = await req.json().catch(() => ({ password: '' }))
  const ok = verify(password, process.env)
  if (ok) attempts.delete(key)
  return NextResponse.json({ ok })
}
