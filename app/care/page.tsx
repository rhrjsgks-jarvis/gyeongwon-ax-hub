'use client'

import { useEffect } from 'react'
import { logOnce } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function CarePage() {
  /* **세션당 1회**(2026-08-20) — 제품 로그가 따로 남는다. 매번 쌓으면 같은 상담이 두 번 세어진다 */
  useEffect(() => { logOnce('care', 'page_view') }, [])

  return (
    <IframeModule
      src="/care-app.html"
      title="AI구독 케어 안내"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
