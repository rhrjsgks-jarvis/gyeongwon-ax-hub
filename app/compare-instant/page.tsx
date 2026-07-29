'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'

export default function CompareInstantPage() {
  useEffect(() => { logEvent('compareInstant', 'page_view') }, [])

  return (
    <div
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    >
      <iframe
        src="/compare-app.html?mode=db"
        className="w-full h-full border-0"
        title="즉시비교 (개선중)"
      />
    </div>
  )
}
