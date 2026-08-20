'use client'

import { useEffect } from 'react'
import { logOnce } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function AsPage() {
  /* **세션당 1회**(2026-08-20) — 품목·연락처 탭 로그가 따로 남는다. 매번 쌓으면 같은 상담이 두 번 세어진다 */
  useEffect(() => { logOnce('as', 'page_view') }, [])

  return (
    <IframeModule
      src="/as-app.html"
      title="AS 관련 정보"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
