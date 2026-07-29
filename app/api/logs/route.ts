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
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      return NextResponse.json({ logs: [], connected: false, error: `GAS ${res.status}` })
    }
    const data = await res.json()
    return NextResponse.json({ logs: Array.isArray(data.logs) ? data.logs : [], connected: true })
  } catch (err) {
    return NextResponse.json({ logs: [], connected: false, error: String(err) })
  }
}
