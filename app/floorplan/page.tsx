'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function FloorplanPage() {
  useEffect(() => { logEvent('floorplan', 'page_view') }, [])

  return (
    <IframeModule
      src="/floorplan-app.html"
      title="도면 배치 시뮬레이터"
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
