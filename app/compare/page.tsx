'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'

export default function ComparePage() {
  useEffect(() => { logEvent('compare', 'page_view') }, [])

  return (
    <div
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    >
      <iframe
        src="/compare-app.html?mode=url"
        className="w-full h-full border-0"
        title="타사비교 세일즈가이드"
      />
    </div>
  )
}
