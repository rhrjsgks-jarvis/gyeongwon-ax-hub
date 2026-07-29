import { NextResponse } from 'next/server'

// 건의사항은 실패 여부를 사용자에게 보여줘야 하므로(no-cors 방식과 달리) 서버를 경유해
// Google Apps Script에 전달하고 실제 응답 결과를 그대로 돌려준다.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_GAS_URL
  if (!url) {
    return NextResponse.json({ ok: false, error: 'GAS_URL not configured' })
  }

  try {
    const body = await req.text()
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `GAS ${res.status}` })
    }
    const data = await res.json().catch(() => null)
    return NextResponse.json({ ok: data ? !!data.ok : true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) })
  }
}
