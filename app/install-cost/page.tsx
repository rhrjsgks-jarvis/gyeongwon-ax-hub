'use client'

import { useEffect } from 'react'
import { logOnce } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function InstallCostPage() {
  /* **세션당 1회**(2026-08-20) — 사장님 지시 — 통으로 1회. 매번 쌓으면 같은 상담이 두 번 세어진다 */
  useEffect(() => { logOnce('installcost', 'page_view') }, [])

  return (
    <IframeModule
      src="/install-cost-app.html"
      title="설치비용 · 사전준비"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
