'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function TestPage() {
  useEffect(() => { logEvent('test', 'page_view') }, [])

  return (
    <IframeModule
      src="/test-app.html"
      title="경원영업팀 레벨업테스트 2026"
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
