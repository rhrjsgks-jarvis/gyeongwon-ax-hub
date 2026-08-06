'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function PlacePage() {
  useEffect(() => { logEvent('place', 'page_view') }, [])

  return (
    <IframeModule
      src="/place-app.html"
      title="가전 배치 시뮬레이터"
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
