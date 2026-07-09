'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'

export default function PlannerPage() {
  useEffect(() => {
    logEvent('planner', 'page_view')
  }, [])

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <iframe
        src="/package-planner.html"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="패키지 플래너"
      />
    </div>
  )
}
