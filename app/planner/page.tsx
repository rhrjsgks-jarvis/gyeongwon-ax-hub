'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function PlannerPage() {
  useEffect(() => {
    logEvent('planner', 'page_view')
  }, [])

  return (
    <IframeModule
      src="/package-planner.html"
      title="패키지 플래너"
      style={{ width: '100%', height: '100vh' }}
    />
  )
}
