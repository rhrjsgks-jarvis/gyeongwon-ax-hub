'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'

export default function CarePage() {
  useEffect(() => { logEvent('care', 'page_view') }, [])

  return (
    <div
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    >
      <iframe
        src="/care-app.html"
        className="w-full h-full border-0"
        title="AI Care 케어십 검색기"
      />
    </div>
  )
}
