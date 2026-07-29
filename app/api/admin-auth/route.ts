import { NextResponse } from 'next/server'
import { createHash } from 'crypto'

// 비밀번호 해시를 서버에만 두고 검증 결과(true/false)만 클라이언트에 돌려준다.
// 이전에는 클라이언트 번들에 해시가 그대로 노출되어 페이지 소스로 오프라인 대입공격이
// 가능했다.
export const dynamic = 'force-dynamic'

const ADMIN_PW_HASH = '60fe74406e7f353ed979f350f2fbb6a2e8690a5fa7d1b0c32983d1d8b3f95f67'

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }))
  const hash = createHash('sha256').update(String(password || '')).digest('hex')
  return NextResponse.json({ ok: hash === ADMIN_PW_HASH })
}
