'use client'

import { useEffect } from 'react'
import { logEvent } from '@/lib/logEvent'
import IframeModule from '@/components/IframeModule'

export default function ComparePage() {
  useEffect(() => { logEvent('compare', 'page_view') }, [])

  return (
    <IframeModule
      src="/compare-app.html"
      title="타사비교 세일즈가이드"
      className="-m-4 lg:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    />
  )
}
