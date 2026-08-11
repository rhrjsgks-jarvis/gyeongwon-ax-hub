'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function TestPage() {
  useEffect(() => { logEvent('test', 'page_view') }, [])

  return (
    <IframeModule
      src="/test-app.html"
      title="레벨업 챌린지 2026"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
