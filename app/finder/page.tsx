'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function FinderPage() {
  useEffect(() => { logEvent('finder', 'page_view') }, [])

  return (
    <IframeModule
      src="/finder-app.html"
      title="모델파인더 — 제품 상세검색"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
