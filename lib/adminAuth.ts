import { createHash, timingSafeEqual } from 'crypto'

/*
 * 관리자 비밀번호 검증 — 라우트에서 떼어낸 순수 함수다.
 *
 * 떼어낸 이유는 **테스트가 안 되고 있었기 때문**이다. 값이 안 맞아도 화면에는
 * "비밀번호가 다릅니다" 한 줄만 뜨고, 원인이 오타인지 환경변수 미적용인지
 * 배포 문제인지 구분할 방법이 없었다(2026-08-11 실제로 여기서 막혔다).
 * 순수 함수면 `scripts/test-admin.mjs` 가 환경변수 조합을 직접 넣어 검사할 수 있다.
 *
 * 비밀번호는 **두 가지 방법 중 하나**로 준다:
 *   1. `ADMIN_PW`      — 평문. Vercel 환경변수에 비밀번호를 그대로 적는다(2026-08-11 사용자 선택).
 *   2. `ADMIN_PW_HASH` — SHA-256 16진수 64자. 값이 노출돼도 비밀번호가 바로 드러나지 않는다.
 * 둘 다 있으면 평문이 이긴다 — 사람이 나중에 적은 쪽을 의도로 본다.
 *
 * **둘 다 서버 전용이다. `NEXT_PUBLIC_` 접두사를 붙이지 말 것** — 붙이면 클라이언트
 * 번들에 그대로 실려 누구나 열어볼 수 있고, 그 순간 이 검증이 전부 무의미해진다.
 */

/* 환경변수를 안 넣어도 배포가 끊기지 않게 하는 폴백. 이 저장소는 public 이라
 * 이 해시는 이미 공개돼 있다 — 실제 운영에서는 반드시 위 둘 중 하나를 설정할 것. */
export const FALLBACK_HASH = '60fe74406e7f353ed979f350f2fbb6a2e8690a5fa7d1b0c32983d1d8b3f95f67'

/* `process.env`(인덱스 시그니처)를 그대로 넘길 수 있어야 하므로 선택적 필드 대신 인덱스로 둔다 */
export type AdminEnv = { readonly [key: string]: string | undefined }

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/*
 * 붙여넣다 섞이는 것들을 걷어낸다. 실제로 이것 때문에 한 번 막혔다 —
 * `timingSafeEqual` 은 길이부터 보므로 **끝에 줄바꿈 하나만 붙어도 즉시 불일치**이고,
 * 화면에는 그냥 "비밀번호가 다릅니다"로만 보여 원인을 찾을 수가 없다.
 *
 * 그래서 앞뒤 공백과 감싸는 따옴표를 떼어낸다. 비밀번호가 공백으로 시작하거나
 * 끝나는 경우는 지원하지 않는다 — 그런 비밀번호를 쓸 일보다 붙여넣기 사고가 훨씬 잦다.
 */
export function clean(v: string | undefined): string {
  if (!v) return ''
  let s = String(v).trim()
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    s = s.slice(1, -1).trim()
  }
  return s
}

/** 지금 서버가 기다리고 있는 해시. 어디서 왔는지(source)도 함께 돌려준다. */
export function resolveExpected(env: AdminEnv): { hash: string; source: 'plain' | 'hash' | 'fallback' } {
  const plain = clean(env.ADMIN_PW)
  if (plain) return { hash: sha256(plain), source: 'plain' }

  /* 16진수는 대소문자를 가리지 않으므로 내려 맞춘다 — 대문자로 붙여넣어 틀리는 일이 잦다 */
  const hash = clean(env.ADMIN_PW_HASH).toLowerCase()
  if (hash) return { hash, source: 'hash' }

  return { hash: FALLBACK_HASH, source: 'fallback' }
}

/** 길이가 다르면 timingSafeEqual 이 던지므로 먼저 거른다(그 자체가 불일치다). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function verify(password: unknown, env: AdminEnv): boolean {
  return safeEqual(sha256(String(password ?? '')), resolveExpected(env).hash)
}

/*
 * 설정이 어떤 상태인지 한 줄로 알려 준다 — **비밀번호도 해시도 싣지 않는다.**
 * 값을 로그에 남기면 로그를 보는 사람이 곧 관리자가 된다. 대신 "무엇이 잘못됐는지"를
 * 짚을 수 있을 만큼만 적는다: 어느 변수를 쓰는지, 해시 길이가 64자가 맞는지.
 */
export function configWarning(env: AdminEnv): string | null {
  const { source } = resolveExpected(env)
  if (source === 'fallback') {
    return '[admin-auth] ADMIN_PW / ADMIN_PW_HASH 둘 다 미설정 — public 저장소에 있는 폴백 해시를 쓰는 중입니다. ' +
      'Vercel 환경변수에 ADMIN_PW(평문)를 등록하세요.'
  }
  if (source === 'hash') {
    const h = clean(env.ADMIN_PW_HASH).toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(h)) {
      return `[admin-auth] ADMIN_PW_HASH 형식이 SHA-256 16진수 64자가 아닙니다(현재 ${h.length}자) — ` +
        '평문을 넣으셨다면 ADMIN_PW 로 옮기세요.'
    }
  }
  return null
}
