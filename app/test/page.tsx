'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'

export default function TestPage() {
  useEffect(() => { logEvent('test', 'page_view') }, [])

  return (
    <div
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    >
      <iframe
        src="/test-app.html"
        className="w-full h-full border-0"
        title="경원영업팀 레벨업테스트 2026"
      />
    </div>
  )
}
